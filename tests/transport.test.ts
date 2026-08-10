import { describe, expect, it } from 'vitest'
import {
  bearingDegrees,
  boundsOf,
  distanceMeters,
  fitProjection,
  pathLengthMeters,
} from '../src/lib/geo'
import { documentAlerts } from '../src/server/modules/transport/service'
import { nextStopFor, type TrackedStop } from '../src/server/modules/transport/tracking'

/**
 * Transport is the module a parent looks at while their child is standing at a
 * kerb, so these tests are about the two things that would embarrass us there:
 * a bus drawn in the wrong place, and an arrival estimate that says the bus is
 * coming when it has already been.
 */

const VIEW = { width: 1000, height: 600, padding: 50 }

function stop(id: string, sortOrder: number, latitude: number, longitude: number): TrackedStop {
  return {
    id,
    name: `Stop ${sortOrder}`,
    sortOrder,
    latitude,
    longitude,
    pickupTime: null,
    dropTime: null,
    riders: 0,
    served: false,
    isOwnStop: false,
  }
}

describe('map projection', () => {
  it('keeps north above south and east right of west', () => {
    const south = { latitude: 28.4, longitude: 77.0 }
    const north = { latitude: 28.5, longitude: 77.0 }
    const east = { latitude: 28.45, longitude: 77.1 }

    const project = fitProjection([south, north, east], VIEW)

    expect(project(north).y).toBeLessThan(project(south).y)
    expect(project(east).x).toBeGreaterThan(project(south).x)
  })

  it('fits every point inside the viewbox', () => {
    const points = [
      { latitude: 28.41, longitude: 76.98 },
      { latitude: 28.52, longitude: 77.11 },
      { latitude: 28.47, longitude: 77.04 },
    ]
    const project = fitProjection(points, VIEW)

    for (const point of points) {
      const { x, y } = project(point)
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(VIEW.width)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(VIEW.height)
    }
  })

  it('survives a single point without dividing by zero', () => {
    const only = { latitude: 28.4595, longitude: 77.0266 }
    const { x, y } = fitProjection([only], VIEW)(only)

    expect(Number.isFinite(x)).toBe(true)
    expect(Number.isFinite(y)).toBe(true)
    expect(x).toBeCloseTo(VIEW.width / 2, 5)
  })

  it('does not stretch a square route into a rectangle', () => {
    // A degree of longitude is shorter than a degree of latitude at this
    // latitude, so an equal-degree box must NOT project as a square.
    const box = [
      { latitude: 28.4, longitude: 77.0 },
      { latitude: 28.5, longitude: 77.1 },
    ]
    const project = fitProjection(box, VIEW)
    const width = Math.abs(project(box[1]!).x - project(box[0]!).x)
    const height = Math.abs(project(box[1]!).y - project(box[0]!).y)

    expect(width).toBeLessThan(height)
  })

  it('reports the bounds of a set of points', () => {
    const bounds = boundsOf([
      { latitude: 10, longitude: 20 },
      { latitude: -5, longitude: 45 },
    ])
    expect(bounds).toEqual({ minLat: -5, maxLat: 10, minLng: 20, maxLng: 45 })
    expect(boundsOf([])).toBeNull()
  })
})

describe('distance and bearing', () => {
  it('measures a short hop in metres', () => {
    // ~0.001 degrees of latitude is about 111 metres anywhere on Earth.
    const metres = distanceMeters(
      { latitude: 28.45, longitude: 77.02 },
      { latitude: 28.451, longitude: 77.02 },
    )
    expect(metres).toBeGreaterThan(100)
    expect(metres).toBeLessThan(120)
  })

  it('points north when travelling north', () => {
    const bearing = bearingDegrees(
      { latitude: 28.45, longitude: 77.02 },
      { latitude: 28.46, longitude: 77.02 },
    )
    expect(bearing).toBeCloseTo(0, 1)
  })

  it('adds up the legs of a path', () => {
    const legs = [
      { latitude: 28.45, longitude: 77.02 },
      { latitude: 28.451, longitude: 77.02 },
      { latitude: 28.452, longitude: 77.02 },
    ]
    expect(pathLengthMeters(legs)).toBeCloseTo(
      distanceMeters(legs[0]!, legs[1]!) + distanceMeters(legs[1]!, legs[2]!),
      5,
    )
  })
})

describe('next stop and arrival estimate', () => {
  const stops = [
    stop('a', 1, 28.42, 77.0),
    stop('b', 2, 28.44, 77.01),
    stop('c', 3, 28.46, 77.02),
  ]

  const at = (latitude: number, longitude: number, speedKph: number | null = 20) => ({
    latitude,
    longitude,
    speedKph,
    headingDeg: null,
    recordedAt: new Date().toISOString(),
  })

  it('returns nothing without a position', () => {
    expect(nextStopFor(stops, null, new Set())).toBeNull()
  })

  it('returns nothing when no stop has been plotted', () => {
    const unplotted = stops.map((s) => ({ ...s, latitude: null, longitude: null }))
    expect(nextStopFor(unplotted, at(28.43, 77.0), new Set())).toBeNull()
  })

  it('heads for the nearest stop when nothing has been served', () => {
    const next = nextStopFor(stops, at(28.435, 77.005), new Set())
    expect(next?.id).toBe('b')
  })

  it('moves on once the bus is standing at a stop', () => {
    // Sitting on stop b: the answer must be c, not the stop underneath it.
    const next = nextStopFor(stops, at(28.44, 77.01), new Set())
    expect(next?.id).toBe('c')
  })

  it('trusts the boarding log over proximity', () => {
    // The bus is closest to b, but b is recorded as done — so c is next even
    // though the bus has not physically left b behind.
    const next = nextStopFor(stops, at(28.44, 77.01), new Set(['a', 'b']))
    expect(next?.id).toBe('c')
  })

  it('gives a whole number of minutes, never zero', () => {
    const next = nextStopFor(stops, at(28.4599, 77.0199), new Set(['a', 'b']))
    expect(next?.etaMinutes).toBeGreaterThanOrEqual(1)
    expect(Number.isInteger(next?.etaMinutes)).toBe(true)
  })

  it('does not let a crawling bus produce an absurd estimate', () => {
    // Stopped in traffic 2km away: the assumed city speed keeps the estimate
    // in minutes rather than running to hours.
    const slow = nextStopFor(stops, at(28.42, 77.0, 0), new Set(['a']))
    expect(slow?.etaMinutes).toBeLessThan(60)
  })

  it('returns nothing once every stop has been served', () => {
    expect(nextStopFor(stops, at(28.46, 77.02), new Set(['a', 'b', 'c']))).toBeNull()
  })
})

describe('vehicle paperwork', () => {
  const days = (n: number) => new Date(Date.now() + n * 86_400_000)

  it('flags expired papers as expired', () => {
    const alerts = documentAlerts({
      insuranceExpiresOn: days(-3),
      fitnessExpiresOn: null,
      pollutionExpiresOn: null,
    })
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toMatchObject({ label: 'Insurance', expired: true })
  })

  it('warns before a lapse but stays quiet about distant renewals', () => {
    const alerts = documentAlerts({
      insuranceExpiresOn: days(10),
      fitnessExpiresOn: days(200),
      pollutionExpiresOn: null,
    })
    expect(alerts.map((a) => a.label)).toEqual(['Insurance'])
    expect(alerts[0]!.expired).toBe(false)
  })

  it('says nothing when there are no dates on file', () => {
    expect(
      documentAlerts({
        insuranceExpiresOn: null,
        fitnessExpiresOn: null,
        pollutionExpiresOn: null,
      }),
    ).toEqual([])
  })
})
