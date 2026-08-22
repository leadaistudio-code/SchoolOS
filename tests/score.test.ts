import { describe, expect, it } from 'vitest'
import {
  averageScore,
  bandCounts,
  bandFor,
  composeScore,
  defaultWeights,
  metricsFor,
  resolveWeights,
  weightShares,
  STUDENT_METRICS,
  STAFF_METRICS,
  type MetricReading,
  type WeightSetting,
} from '../src/lib/score'

const w = (metric: string, weight: number, isEnabled = true): WeightSetting => ({
  metric,
  weight,
  isEnabled,
})
const r = (metric: string, score: number | null): MetricReading => ({
  metric,
  score,
  detail: 'test',
})

describe('the metric catalogue', () => {
  it('gives each metric a unique key', () => {
    const keys = [...STUDENT_METRICS, ...STAFF_METRICS].map((m) => m.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('ships student weights that add up to 100', () => {
    const total = STUDENT_METRICS.reduce((sum, m) => sum + m.defaultWeight, 0)
    expect(total).toBe(100)
  })

  it('ships staff weights that add up to 100', () => {
    const total = STAFF_METRICS.reduce((sum, m) => sum + m.defaultWeight, 0)
    expect(total).toBe(100)
  })

  it('keeps the two populations separate', () => {
    expect(metricsFor('STUDENT').every((m) => m.population === 'STUDENT')).toBe(true)
    expect(metricsFor('STAFF').every((m) => m.population === 'STAFF')).toBe(true)
  })
})

describe('composing a score', () => {
  it('is the weighted mean when every metric reports', () => {
    const composed = composeScore(
      [r('ACADEMICS', 80), r('ATTENDANCE', 90)],
      [w('ACADEMICS', 50), w('ATTENDANCE', 50)],
    )
    expect(composed.score).toBe(85)
    expect(composed.coverage).toBe(1)
  })

  it('honours the weighting rather than averaging blindly', () => {
    const composed = composeScore(
      [r('ACADEMICS', 100), r('ATTENDANCE', 0)],
      [w('ACADEMICS', 75), w('ATTENDANCE', 25)],
    )
    expect(composed.score).toBe(75)
  })

  it('treats relative weights as identical to percentages', () => {
    const asPercent = composeScore(
      [r('ACADEMICS', 90), r('ATTENDANCE', 60)],
      [w('ACADEMICS', 30), w('ATTENDANCE', 10)],
    )
    const asRatio = composeScore(
      [r('ACADEMICS', 90), r('ATTENDANCE', 60)],
      [w('ACADEMICS', 3), w('ATTENDANCE', 1)],
    )
    expect(asRatio.score).toBe(asPercent.score)
  })

  it('never scores a missing metric as a zero', () => {
    const composed = composeScore(
      [r('ACADEMICS', null), r('ATTENDANCE', 80)],
      [w('ACADEMICS', 50), w('ATTENDANCE', 50)],
    )
    // The whole point: no results yet must not read as having failed.
    expect(composed.score).toBe(80)
    expect(composed.score).not.toBe(40)
  })

  it('reports how much of the weighting had data behind it', () => {
    const composed = composeScore(
      [r('ACADEMICS', null), r('ATTENDANCE', 80)],
      [w('ACADEMICS', 70), w('ATTENDANCE', 30)],
    )
    expect(composed.coverage).toBeCloseTo(0.3, 5)
  })

  it('shares a missing metric’s weight across the rest in proportion', () => {
    const composed = composeScore(
      [r('ACADEMICS', null), r('ATTENDANCE', 90), r('HOMEWORK', 60)],
      [w('ACADEMICS', 50), w('ATTENDANCE', 30), w('HOMEWORK', 20)],
    )
    // 30:20 of the remaining weight, so 0.6 and 0.4 — not 0.3 and 0.2.
    expect(composed.score).toBeCloseTo(90 * 0.6 + 60 * 0.4, 5)

    const attendance = composed.parts.find((p) => p.metric === 'ATTENDANCE')!
    expect(attendance.configuredShare).toBeCloseTo(0.3, 5)
    expect(attendance.effectiveShare).toBeCloseTo(0.6, 5)
  })

  it('returns no score at all when nothing could be read', () => {
    const composed = composeScore(
      [r('ACADEMICS', null), r('ATTENDANCE', null)],
      [w('ACADEMICS', 50), w('ATTENDANCE', 50)],
    )
    expect(composed.score).toBeNull()
    expect(composed.band).toBeNull()
    expect(composed.coverage).toBe(0)
  })

  it('returns no score when every metric is switched off', () => {
    const composed = composeScore([r('ACADEMICS', 90)], [w('ACADEMICS', 50, false)])
    expect(composed.score).toBeNull()
    expect(composed.parts).toHaveLength(0)
  })

  it('ignores a metric with a zero weight even when it has data', () => {
    const composed = composeScore(
      [r('ACADEMICS', 0), r('ATTENDANCE', 100)],
      [w('ACADEMICS', 0), w('ATTENDANCE', 10)],
    )
    expect(composed.score).toBe(100)
    expect(composed.parts.map((p) => p.metric)).toEqual(['ATTENDANCE'])
  })

  it('ignores readings for metrics that carry no weight', () => {
    const composed = composeScore(
      [r('ACADEMICS', 90), r('LIBRARY', 10)],
      [w('ACADEMICS', 100)],
    )
    expect(composed.score).toBe(90)
  })

  it('clamps a reading that overshoots the scale', () => {
    // A percentage above 100 is possible with bonus marks; it must not let one
    // metric drag the total past the top of the scale.
    const composed = composeScore([r('ACADEMICS', 140)], [w('ACADEMICS', 10)])
    expect(composed.score).toBe(100)
  })

  it('puts the heaviest metric first so the biggest lever is read first', () => {
    const composed = composeScore(
      [r('ACADEMICS', 50), r('ATTENDANCE', 50), r('HOMEWORK', 50)],
      [w('ACADEMICS', 10), w('ATTENDANCE', 60), w('HOMEWORK', 30)],
    )
    expect(composed.parts.map((p) => p.metric)).toEqual(['ATTENDANCE', 'HOMEWORK', 'ACADEMICS'])
  })

  it('has contributions that add up to the score', () => {
    const composed = composeScore(
      [r('ACADEMICS', 82), r('ATTENDANCE', 91), r('HOMEWORK', 44)],
      [w('ACADEMICS', 30), w('ATTENDANCE', 25), w('HOMEWORK', 15)],
    )
    const summed = composed.parts.reduce((total, p) => total + p.contribution, 0)
    expect(summed).toBeCloseTo(composed.score!, 1)
  })
})

describe('bands', () => {
  it('places a score in the band its threshold names', () => {
    expect(bandFor(100)).toBe('EXCELLENT')
    expect(bandFor(85)).toBe('EXCELLENT')
    expect(bandFor(84.9)).toBe('GOOD')
    expect(bandFor(70)).toBe('GOOD')
    expect(bandFor(69.9)).toBe('FAIR')
    expect(bandFor(55)).toBe('FAIR')
    expect(bandFor(54.9)).toBe('AT_RISK')
    expect(bandFor(0)).toBe('AT_RISK')
  })

  it('counts a population across the bands, skipping the unscored', () => {
    const counts = bandCounts([90, 72, 60, 20, null])
    expect(counts).toEqual({ EXCELLENT: 1, GOOD: 1, FAIR: 1, AT_RISK: 1 })
  })
})

describe('averaging a group', () => {
  it('averages only those that could be scored', () => {
    expect(averageScore([80, 90, null])).toEqual({ score: 85, counted: 2 })
  })

  it('does not let an unscored member drag the group down', () => {
    // Counting the null as a zero would give 56.7 and blame the class for a
    // gap in the school's own records.
    expect(averageScore([80, 90, null]).score).toBe(85)
  })

  it('has no answer when nobody could be scored', () => {
    expect(averageScore([null, null])).toEqual({ score: null, counted: 0 })
  })
})

describe('resolving stored weights', () => {
  it('falls back to the shipped default for a metric never touched', () => {
    const resolved = resolveWeights('STUDENT', [])
    expect(resolved).toEqual(defaultWeights('STUDENT'))
  })

  it('lets a stored row override the default', () => {
    const resolved = resolveWeights('STUDENT', [w('ACADEMICS', 5)])
    expect(resolved.find((x) => x.metric === 'ACADEMICS')!.weight).toBe(5)
    expect(resolved.find((x) => x.metric === 'ATTENDANCE')!.weight).toBe(25)
  })

  it('keeps a metric switched off when that is what was stored', () => {
    const resolved = resolveWeights('STUDENT', [w('ACADEMICS', 30, false)])
    expect(resolved.find((x) => x.metric === 'ACADEMICS')!.isEnabled).toBe(false)
  })

  it('drops a metric whose module the school does not have', () => {
    const resolved = resolveWeights('STUDENT', [], { transport: false, library: false })
    const keys = resolved.map((x) => x.metric)
    expect(keys).not.toContain('TRANSPORT')
    expect(keys).not.toContain('LIBRARY')
    expect(keys).toContain('ATTENDANCE')
  })

  it('keeps module metrics when the module is on', () => {
    const resolved = resolveWeights('STUDENT', [], { transport: true, library: true })
    expect(resolved.map((x) => x.metric)).toContain('TRANSPORT')
  })
})

describe('weight shares shown in the editor', () => {
  it('normalises to a hundred', () => {
    const shares = weightShares([w('A', 3), w('B', 1)])
    expect(shares.get('A')).toBeCloseTo(75, 5)
    expect(shares.get('B')).toBeCloseTo(25, 5)
  })

  it('gives a disabled metric no share', () => {
    const shares = weightShares([w('A', 50), w('B', 50, false)])
    expect(shares.get('A')).toBe(100)
    expect(shares.get('B')).toBe(0)
  })

  it('does not divide by zero when everything is off', () => {
    const shares = weightShares([w('A', 0), w('B', 0)])
    expect(shares.get('A')).toBe(0)
  })
})
