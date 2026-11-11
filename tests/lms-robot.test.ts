import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SETTINGS,
  TRACKS,
  TRUTH_TABLE,
  customTrack,
  decide,
  drive,
  motorsFor,
  pinLevel,
  readSensors,
  simulate,
} from '@/lib/lms/robot'

const track = (id: string) => TRACKS.find((t) => t.id === id)!

describe('line-follower rules', () => {
  it('follows the truth table taught in Lesson 11', () => {
    for (const row of TRUTH_TABLE) expect(decide(row.reading)).toBe(row.action)
  })

  it('swapped rules turn the wrong way', () => {
    expect(decide({ left: true, right: false }, { swapped: true, bothOnLine: 'STOP' })).toBe('RIGHT')
    expect(decide({ left: false, right: true }, { swapped: true, bothOnLine: 'STOP' })).toBe('LEFT')
  })

  it('maps actions to wheel speeds', () => {
    const algo = DEFAULT_SETTINGS.algorithm
    expect(motorsFor('FORWARD', algo)).toEqual({ left: 150, right: 150 })
    expect(motorsFor('LEFT', algo).left).toBeLessThan(motorsFor('LEFT', algo).right)
    expect(motorsFor('RIGHT', algo).right).toBeLessThan(motorsFor('RIGHT', algo).left)
    expect(motorsFor('STOP', algo)).toEqual({ left: 0, right: 0 })
    expect(motorsFor('LEFT', { ...algo, turnStyle: 'pivot' }).left).toBeLessThan(0)
  })

  it('explains sensor polarity both ways', () => {
    expect(pinLevel(true)).toBe('HIGH')
    expect(pinLevel(false)).toBe('LOW')
    expect(pinLevel(true, false)).toBe('LOW')
  })
})

describe('differential drive', () => {
  it('drives straight when both wheels match', () => {
    const r = drive({ x: 0, y: 0, heading: 0 }, { left: 200, right: 200 }, 0.5)
    expect(r.y).toBeCloseTo(0)
    expect(r.x).toBeGreaterThan(0)
  })

  it('turns left (up the screen) when the right wheel is faster', () => {
    const r = drive({ x: 0, y: 0, heading: 0 }, { left: 50, right: 200 }, 0.5)
    expect(r.heading).toBeLessThan(0)
    expect(r.y).toBeLessThan(0)
  })

  it('reads white on both sensors when centred on a straight line', () => {
    const t = track('straight')
    expect(readSensors(t.start, t, DEFAULT_SETTINGS).reading).toEqual({ left: false, right: false })
  })
})

describe('simulated runs', () => {
  const algo = (a: Partial<typeof DEFAULT_SETTINGS.algorithm>) => ({ ...DEFAULT_SETTINGS.algorithm, ...a })

  it.each(['straight', 'curve', 's-curve', 'oval'])('the reference algorithm completes the %s track', (id) => {
    expect(simulate(track(id), { ...DEFAULT_SETTINGS, algorithm: algo({ turnStyle: 'pivot', baseSpeed: 120 }) }).status).toBe('finished')
  })

  it('pivot turns get round sharp corners across a range of speeds; gentle turns do not', () => {
    for (const baseSpeed of [80, 100, 120, 140]) {
      expect(simulate(track('sharp'), { ...DEFAULT_SETTINGS, algorithm: algo({ turnStyle: 'pivot', baseSpeed }) }).status).toBe('finished')
      expect(simulate(track('sharp'), { ...DEFAULT_SETTINGS, algorithm: algo({ turnStyle: 'gentle', baseSpeed }) }).status).toBe('lost')
    }
  })

  it('experiment 1 and 4: gentle turns lose the S-curve at high speed, pivot turns hold it', () => {
    expect(simulate(track('s-curve'), { ...DEFAULT_SETTINGS, algorithm: algo({ turnStyle: 'gentle', baseSpeed: 220 }) }).status).toBe('lost')
    expect(simulate(track('s-curve'), { ...DEFAULT_SETTINGS, algorithm: algo({ turnStyle: 'gentle', baseSpeed: 120 }) }).status).toBe('finished')
    expect(simulate(track('s-curve'), { ...DEFAULT_SETTINGS, algorithm: algo({ turnStyle: 'pivot', baseSpeed: 200 }) }).status).toBe('finished')
  })

  it('experiment 2: an over-sensitive sensor sees black everywhere and stops', () => {
    expect(simulate(track('curve'), { ...DEFAULT_SETTINGS, sensitivity: 0.95 }).status).toBe('stopped')
    expect(simulate(track('curve'), { ...DEFAULT_SETTINGS, sensitivity: 0.5 }).status).toBe('finished')
  })

  it('the gentle algorithm completes the curve', () => {
    expect(simulate(track('curve'), DEFAULT_SETTINGS).status).toBe('finished')
  })

  it('swapped rules lose the line on a curve', () => {
    const out = simulate(track('curve'), { ...DEFAULT_SETTINGS, algorithm: { ...DEFAULT_SETTINGS.algorithm, swapped: true } })
    expect(out.status).toBe('lost')
  })

  it('is deterministic', () => {
    expect(simulate(track('s-curve'), DEFAULT_SETTINGS)).toEqual(simulate(track('s-curve'), DEFAULT_SETTINGS))
  })

  it('builds a custom track from drawn points', () => {
    expect(customTrack([{ x: 1, y: 1 }])).toBeNull()
    expect(customTrack([{ x: 100, y: 100 }, { x: 400, y: 100 }])?.points).toHaveLength(2)
  })
})
