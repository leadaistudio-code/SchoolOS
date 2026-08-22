import { describe, expect, it } from 'vitest'
import {
  distanceMeters,
  googleMapsLink,
  isValidLatLng,
  parseLocationInput,
} from '../src/lib/geo-input'

/** A convenience: assert a parse succeeded and hand back the coordinates. */
function parsed(input: string) {
  const result = parseLocationInput(input)
  if (!result.ok) throw new Error(`expected a match for: ${input}`)
  return result.value
}

describe('pasting a Google Maps link', () => {
  it('reads the map centre from a place URL', () => {
    const value = parsed('https://www.google.com/maps/@19.076,72.8777,17z')
    expect(value.latitude).toBeCloseTo(19.076, 4)
    expect(value.longitude).toBeCloseTo(72.8777, 4)
  })

  it('prefers the pin over the map centre when a URL carries both', () => {
    // After a search the two differ, and the pin is the place the user chose.
    const value = parsed(
      'https://www.google.com/maps/place/School/@19.0,72.0,17z/data=!3m1!4b1!4m5!3d19.076!4d72.8777',
    )
    expect(value.latitude).toBeCloseTo(19.076, 4)
    expect(value.longitude).toBeCloseTo(72.8777, 4)
  })

  it('reads a q= search link', () => {
    const value = parsed('https://maps.google.com/?q=19.076,72.8777')
    expect(value.latitude).toBeCloseTo(19.076, 4)
  })

  it('reads a ll= link', () => {
    expect(parsed('https://maps.google.com/?ll=28.6139,77.2090').latitude).toBeCloseTo(28.6139, 4)
  })

  it('reads the modern search API link', () => {
    const value = parsed('https://www.google.com/maps/search/?api=1&query=12.9716,77.5946')
    expect(value.latitude).toBeCloseTo(12.9716, 4)
    expect(value.longitude).toBeCloseTo(77.5946, 4)
  })

  it('reads an Apple Maps link', () => {
    expect(parsed('https://maps.apple.com/?coordinate=19.076,72.8777').longitude).toBeCloseTo(
      72.8777,
      4,
    )
  })

  it('asks for a short link to be resolved rather than calling it invalid', () => {
    const result = parseLocationInput('https://maps.app.goo.gl/AbCdEfGh123')
    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toBe('NEEDS_RESOLVING')
  })

  it('treats the legacy short domain the same way', () => {
    const result = parseLocationInput('https://goo.gl/maps/AbCdEfGh123')
    expect(!result.ok && result.reason).toBe('NEEDS_RESOLVING')
  })
})

describe('typing coordinates by hand', () => {
  it('accepts a comma-separated pair', () => {
    const value = parsed('19.0760, 72.8777')
    expect(value.latitude).toBeCloseTo(19.076, 4)
    expect(value.longitude).toBeCloseTo(72.8777, 4)
  })

  it('accepts a space-separated pair', () => {
    expect(parsed('19.0760 72.8777').longitude).toBeCloseTo(72.8777, 4)
  })

  it('accepts negative coordinates', () => {
    const value = parsed('-33.8688, 151.2093')
    expect(value.latitude).toBeCloseTo(-33.8688, 4)
  })

  it('accepts degrees, minutes and seconds as shown in the Maps UI', () => {
    const value = parsed(`19°04'33.6"N 72°52'39.7"E`)
    expect(value.latitude).toBeCloseTo(19.0760, 3)
    expect(value.longitude).toBeCloseTo(72.8777, 3)
  })

  it('reads southern and western hemispheres as negative', () => {
    const value = parsed(`33°52'07.7"S 151°12'33.5"W`)
    expect(value.latitude).toBeLessThan(0)
    expect(value.longitude).toBeLessThan(0)
  })

  it('rounds to about a handspan rather than storing phone noise', () => {
    expect(parsed('19.07600000123, 72.87770000456').latitude).toBe(19.076)
  })
})

describe('refusing what it cannot read', () => {
  it('rejects an empty input', () => {
    const result = parseLocationInput('   ')
    expect(result.ok).toBe(false)
  })

  it('rejects prose', () => {
    const result = parseLocationInput('near the big temple, second left')
    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toBe('NO_MATCH')
  })

  it('rejects an impossible latitude', () => {
    const result = parseLocationInput('120.0, 72.8777')
    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toBe('OUT_OF_RANGE')
  })

  it('rejects an impossible longitude', () => {
    const result = parseLocationInput('19.076, 200.0')
    expect(!result.ok && result.reason).toBe('OUT_OF_RANGE')
  })

  it('says what to do instead, rather than just refusing', () => {
    const result = parseLocationInput('not a location')
    expect(!result.ok && 'message' in result && result.message).toMatch(/paste a google maps link/i)
  })
})

describe('validity', () => {
  it('accepts a real place', () => {
    expect(isValidLatLng(19.076, 72.8777)).toBe(true)
  })

  it('rejects null island, because that is an empty form, not a school', () => {
    expect(isValidLatLng(0, 0)).toBe(false)
  })

  it('rejects NaN', () => {
    expect(isValidLatLng(Number.NaN, 72)).toBe(false)
  })

  it('rejects out-of-range values', () => {
    expect(isValidLatLng(91, 0)).toBe(false)
    expect(isValidLatLng(0, 181)).toBe(false)
  })
})

describe('distance', () => {
  it('is zero for the same point', () => {
    expect(distanceMeters({ latitude: 19, longitude: 72 }, { latitude: 19, longitude: 72 })).toBe(0)
  })

  it('measures a known separation to within a percent', () => {
    // Mumbai to Delhi is about 1,150 km.
    const metres = distanceMeters(
      { latitude: 19.076, longitude: 72.8777 },
      { latitude: 28.6139, longitude: 77.209 },
    )
    expect(metres / 1000).toBeGreaterThan(1130)
    expect(metres / 1000).toBeLessThan(1170)
  })

  it('measures a short walk in metres, not kilometres', () => {
    const metres = distanceMeters(
      { latitude: 19.076, longitude: 72.8777 },
      { latitude: 19.0765, longitude: 72.8777 },
    )
    expect(metres).toBeGreaterThan(50)
    expect(metres).toBeLessThan(60)
  })
})

describe('the link back', () => {
  it('points at the saved pin so it can be checked in one click', () => {
    expect(googleMapsLink(19.076, 72.8777)).toBe(
      'https://www.google.com/maps/search/?api=1&query=19.076,72.8777',
    )
  })
})
