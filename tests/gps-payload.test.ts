import { describe, expect, it } from 'vitest'
import { normaliseFix, normalisePayload } from '../src/lib/gps-payload'

describe('Traccar forward payload', () => {
  const traccar = {
    event: null,
    device: { id: 7, uniqueId: '860123456789012', name: 'Bus 12' },
    position: {
      id: 99123,
      deviceId: 7,
      latitude: 19.076,
      longitude: 72.8777,
      speed: 20, // knots
      course: 145.5,
      accuracy: 8,
      fixTime: '2026-08-23T04:15:00.000Z',
    },
  }

  it('reads the nested position', () => {
    const fix = normaliseFix(traccar)!
    expect(fix.latitude).toBeCloseTo(19.076, 4)
    expect(fix.longitude).toBeCloseTo(72.8777, 4)
  })

  it('identifies the device by its uniqueId, not the position id', () => {
    // `position.id` is the row, `device.id` is internal — only uniqueId is the
    // thing an administrator can actually match to a bus.
    expect(normaliseFix(traccar)!.deviceId).toBe('860123456789012')
  })

  it('converts knots to km/h', () => {
    // 20 knots is 37.04 km/h; read as km/h it would say the bus is crawling.
    expect(normaliseFix(traccar)!.speedKph).toBeCloseTo(37, 0)
  })

  it('keeps the course as the heading', () => {
    expect(normaliseFix(traccar)!.headingDeg).toBeCloseTo(145.5, 1)
  })

  it('keeps the device clock time', () => {
    expect(normaliseFix(traccar)!.recordedAt?.toISOString()).toBe('2026-08-23T04:15:00.000Z')
  })
})

describe('flat vendor payloads', () => {
  it('reads imei, lat and lon', () => {
    const fix = normaliseFix({ imei: '123456789012345', lat: 12.9716, lon: 77.5946 })!
    expect(fix.deviceId).toBe('123456789012345')
    expect(fix.latitude).toBeCloseTo(12.9716, 4)
    expect(fix.longitude).toBeCloseTo(77.5946, 4)
  })

  it('reads lng as well as lon', () => {
    expect(normaliseFix({ deviceId: 'A', lat: 19, lng: 72 })!.longitude).toBe(72)
  })

  it('trusts an explicit speedKph over an ambiguous speed', () => {
    expect(normaliseFix({ deviceId: 'A', lat: 19, lon: 72, speed: 20, speedKph: 45 })!.speedKph).toBe(45)
  })

  it('accepts heading under any of its four names', () => {
    for (const key of ['heading', 'headingDeg', 'course', 'bearing']) {
      const fix = normaliseFix({ deviceId: 'A', lat: 19, lon: 72, [key]: 90 })!
      expect(fix.headingDeg).toBe(90)
    }
  })

  it('coerces numeric device ids to strings', () => {
    expect(normaliseFix({ deviceId: 8801, lat: 19, lon: 72 })!.deviceId).toBe('8801')
  })

  it('ignores fields it has never seen', () => {
    const fix = normaliseFix({ deviceId: 'A', lat: 19, lon: 72, batteryLevel: 88, ignition: true })
    expect(fix).not.toBeNull()
  })
})

describe('refusing a bad fix', () => {
  it('drops a payload with no device', () => {
    expect(normaliseFix({ lat: 19, lon: 72 })).toBeNull()
  })

  it('drops a payload with no position', () => {
    expect(normaliseFix({ deviceId: 'A' })).toBeNull()
  })

  it('drops null island, which is what a device with no fix reports', () => {
    expect(normaliseFix({ deviceId: 'A', lat: 0, lon: 0 })).toBeNull()
  })

  it('drops an impossible latitude', () => {
    expect(normaliseFix({ deviceId: 'A', lat: 95, lon: 72 })).toBeNull()
  })

  it('drops an impossible longitude', () => {
    expect(normaliseFix({ deviceId: 'A', lat: 19, lon: 200 })).toBeNull()
  })

  it('drops rubbish entirely', () => {
    expect(normaliseFix('hello')).toBeNull()
    expect(normaliseFix(null)).toBeNull()
    expect(normaliseFix(42)).toBeNull()
  })
})

describe('awkward values', () => {
  it('wraps a heading of 360 to 0, because the column stops there', () => {
    expect(normaliseFix({ deviceId: 'A', lat: 19, lon: 72, heading: 360 })!.headingDeg).toBe(0)
  })

  it('wraps a heading beyond a full turn', () => {
    expect(normaliseFix({ deviceId: 'A', lat: 19, lon: 72, heading: 450 })!.headingDeg).toBe(90)
  })

  it('normalises a negative heading', () => {
    expect(normaliseFix({ deviceId: 'A', lat: 19, lon: 72, heading: -90 })!.headingDeg).toBe(270)
  })

  it('caps an absurd speed rather than storing it', () => {
    expect(normaliseFix({ deviceId: 'A', lat: 19, lon: 72, speedKph: 5000 })!.speedKph).toBe(200)
  })

  it('discards a negative speed', () => {
    expect(normaliseFix({ deviceId: 'A', lat: 19, lon: 72, speedKph: -5 })!.speedKph).toBeNull()
  })

  it('ignores a device clock stuck in 1970', () => {
    // Better to stamp on arrival than to put the trail before the school existed.
    expect(normaliseFix({ deviceId: 'A', lat: 19, lon: 72, fixTime: '1970-01-01T00:00:00Z' })!.recordedAt).toBeNull()
  })

  it('ignores an unparseable time', () => {
    expect(normaliseFix({ deviceId: 'A', lat: 19, lon: 72, fixTime: 'yesterday' })!.recordedAt).toBeNull()
  })

  it('reads a unix timestamp in seconds', () => {
    const fix = normaliseFix({ deviceId: 'A', lat: 19, lon: 72, timestamp: 1_787_000_000 })!
    expect(fix.recordedAt?.getUTCFullYear()).toBe(2026)
  })
})

describe('batches', () => {
  it('accepts a bare array', () => {
    const fixes = normalisePayload([
      { deviceId: 'A', lat: 19, lon: 72 },
      { deviceId: 'A', lat: 19.001, lon: 72.001 },
    ])
    expect(fixes).toHaveLength(2)
  })

  it('accepts a wrapped array', () => {
    for (const key of ['positions', 'locations', 'data', 'items']) {
      const fixes = normalisePayload({ [key]: [{ deviceId: 'A', lat: 19, lon: 72 }] })
      expect(fixes).toHaveLength(1)
    }
  })

  it('accepts a single object', () => {
    expect(normalisePayload({ deviceId: 'A', lat: 19, lon: 72 })).toHaveLength(1)
  })

  it('keeps the good fixes out of a batch containing bad ones', () => {
    // A bus replaying a dead spot must not lose the whole batch to one bad row.
    const fixes = normalisePayload([
      { deviceId: 'A', lat: 19, lon: 72 },
      { lat: 0, lon: 0 },
      { deviceId: 'A', lat: 19.002, lon: 72.002 },
    ])
    expect(fixes).toHaveLength(2)
  })

  it('returns nothing for an empty body', () => {
    expect(normalisePayload({})).toHaveLength(0)
    expect(normalisePayload([])).toHaveLength(0)
  })
})
