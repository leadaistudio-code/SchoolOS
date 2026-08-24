import { describe, expect, it } from 'vitest'
import {
  gradeAnswers,
  readinessFromPercent,
  proficiencyFromPercent,
  computeTopicBreakdown,
  mergeHistory,
  type GradeQuestion,
  type GradedQuestion,
  type HistoryPoint,
} from '../src/server/modules/teacher-refresh/scoring'
import { periodDaysFor, periodStart } from '../src/server/modules/teacher-refresh/period'
import { PERMISSION_KEYS, isValidPermission } from '../src/lib/rbac/permissions'
import { ROLE, SYSTEM_ROLES } from '../src/lib/rbac/roles'

/**
 * The knowledge-refresh module, tested where it matters most and where a
 * database is not required: the grading core, the supportive language mapping,
 * the scheduler's period maths, and the privacy-critical permission grants.
 *
 * The framing constraints are enforced here as assertions, not just prose — a
 * teacher must never be shown a "FAIL", parents and students must never hold any
 * refresh permission, and a teacher must not be able to configure the programme
 * or read another teacher's readiness. If a later change breaks one of those,
 * this suite fails.
 */

/* -------------------------------------------------------------------------- */
/* Grading                                                                    */
/* -------------------------------------------------------------------------- */

function q(id: string, correctIndexes: number[], optionCount = 4, marks = 1): GradeQuestion {
  return {
    refreshQuestionId: id,
    marks,
    options: Array.from({ length: optionCount }, (_, i) => ({ isCorrect: correctIndexes.includes(i) })),
    topicIds: [],
  }
}

describe('gradeAnswers', () => {
  it('marks a single-answer question correct only for the exact choice', () => {
    const questions = [q('q1', [1])]
    expect(gradeAnswers(questions, [{ refreshQuestionId: 'q1', selectedIndexes: [1] }]).correctCount).toBe(1)
    expect(gradeAnswers(questions, [{ refreshQuestionId: 'q1', selectedIndexes: [0] }]).correctCount).toBe(0)
  })

  it('requires the full set for a multi-answer question — no partial credit', () => {
    const questions = [q('q1', [0, 2])]
    const exact = gradeAnswers(questions, [{ refreshQuestionId: 'q1', selectedIndexes: [2, 0] }])
    const subset = gradeAnswers(questions, [{ refreshQuestionId: 'q1', selectedIndexes: [0] }])
    const superset = gradeAnswers(questions, [{ refreshQuestionId: 'q1', selectedIndexes: [0, 1, 2] }])

    expect(exact.correctCount).toBe(1) // order does not matter
    expect(subset.correctCount).toBe(0)
    expect(superset.correctCount).toBe(0)
  })

  it('treats a blank or missing answer as incorrect but still counts its marks', () => {
    const questions = [q('q1', [0], 4, 2)]
    const result = gradeAnswers(questions, []) // no answer submitted at all
    expect(result.correctCount).toBe(0)
    expect(result.score).toBe(0)
    expect(result.maxScore).toBe(2)
  })

  it('ignores answers for questions that are not on the paper', () => {
    const questions = [q('q1', [0])]
    const result = gradeAnswers(questions, [
      { refreshQuestionId: 'q1', selectedIndexes: [0] },
      { refreshQuestionId: 'ghost', selectedIndexes: [3] },
    ])
    expect(result.correctCount).toBe(1)
    expect(result.maxScore).toBe(1)
  })

  it('floors non-positive marks to 1 so a mis-tagged question cannot erase the paper', () => {
    const questions = [q('q1', [0], 4, 0), q('q2', [0], 4, -5)]
    const result = gradeAnswers(questions, [
      { refreshQuestionId: 'q1', selectedIndexes: [0] },
      { refreshQuestionId: 'q2', selectedIndexes: [0] },
    ])
    expect(result.maxScore).toBe(2)
    expect(result.score).toBe(2)
  })

  it('computes a rounded percentage and a running correct count', () => {
    const questions = [q('q1', [0]), q('q2', [0]), q('q3', [0])]
    const result = gradeAnswers(questions, [
      { refreshQuestionId: 'q1', selectedIndexes: [0] },
      { refreshQuestionId: 'q2', selectedIndexes: [1] },
      { refreshQuestionId: 'q3', selectedIndexes: [2] },
    ])
    expect(result.correctCount).toBe(1)
    expect(result.percent).toBe(33.3)
  })

  it('never marks a question with no correct option as correct', () => {
    const questions = [q('q1', [])]
    expect(gradeAnswers(questions, [{ refreshQuestionId: 'q1', selectedIndexes: [] }]).correctCount).toBe(0)
  })
})

/* -------------------------------------------------------------------------- */
/* Readiness & proficiency language                                           */
/* -------------------------------------------------------------------------- */

describe('readinessFromPercent', () => {
  it('maps the four bands by score', () => {
    expect(readinessFromPercent(90, 70).level).toBe('READY')
    expect(readinessFromPercent(80, 70).level).toBe('GOOD')
    expect(readinessFromPercent(60, 70).level).toBe('REFRESH_RECOMMENDED')
    expect(readinessFromPercent(30, 70).level).toBe('ADDITIONAL_REVIEW')
  })

  it('decouples the band from `passed` — the top band can sit above the pass line', () => {
    // Threshold above 85: a "Ready" score is still below the school's line.
    const band = readinessFromPercent(85, 90)
    expect(band.level).toBe('READY')
    expect(band.passed).toBe(false)
  })

  it('passes at or above the configured threshold', () => {
    expect(readinessFromPercent(70, 70).passed).toBe(true)
    expect(readinessFromPercent(69, 70).passed).toBe(false)
  })

  it('clamps out-of-range and NaN input', () => {
    expect(readinessFromPercent(120, 70).level).toBe('READY')
    expect(readinessFromPercent(-5, 70).level).toBe('ADDITIONAL_REVIEW')
    expect(readinessFromPercent(Number.NaN, 70).level).toBe('ADDITIONAL_REVIEW')
  })

  it('never uses punitive pass/fail language', () => {
    for (let pct = 0; pct <= 100; pct += 5) {
      const band = readinessFromPercent(pct, 70)
      const words = `${band.label} ${band.headline}`.toLowerCase()
      expect(words).not.toContain('fail')
      expect(words).not.toContain('pass')
    }
    // The lowest band offers support, and reads as neutral, not alarming.
    expect(readinessFromPercent(10, 70).label).toBe('Additional review suggested')
    expect(readinessFromPercent(10, 70).tone).toBe('neutral')
  })
})

describe('proficiencyFromPercent', () => {
  it('maps topic proficiency by score band', () => {
    expect(proficiencyFromPercent(90)).toBe('STRONG')
    expect(proficiencyFromPercent(85)).toBe('STRONG')
    expect(proficiencyFromPercent(70)).toBe('GOOD')
    expect(proficiencyFromPercent(50)).toBe('REFRESH_RECOMMENDED')
    expect(proficiencyFromPercent(49)).toBe('DEVELOPING')
    expect(proficiencyFromPercent(0)).toBe('DEVELOPING')
  })
})

/* -------------------------------------------------------------------------- */
/* Topic breakdown & history                                                  */
/* -------------------------------------------------------------------------- */

describe('computeTopicBreakdown', () => {
  it('counts a multi-topic question toward each of its topics', () => {
    const perQuestion: GradedQuestion[] = [
      { refreshQuestionId: 'a', isCorrect: true, marksAwarded: 1, marks: 1, topicIds: ['t1', 't2'] },
      { refreshQuestionId: 'b', isCorrect: false, marksAwarded: 0, marks: 1, topicIds: ['t2'] },
    ]
    const rows = computeTopicBreakdown(perQuestion)
    const t1 = rows.find((r) => r.topicId === 't1')!
    const t2 = rows.find((r) => r.topicId === 't2')!

    expect(t1.correct).toBe(1)
    expect(t1.total).toBe(1)
    expect(t1.percent).toBe(100)
    // A weak topic is not hidden by a strong one it shared a question with.
    expect(t2.correct).toBe(1)
    expect(t2.total).toBe(2)
    expect(t2.percent).toBe(50)
  })
})

describe('mergeHistory', () => {
  const point = (percent: number): HistoryPoint => ({ at: '2026-01-01T00:00:00.000Z', percent, proficiency: 'GOOD' })

  it('starts a fresh series when there is no prior history', () => {
    expect(mergeHistory(null, point(80))).toHaveLength(1)
    expect(mergeHistory(undefined, point(80))).toHaveLength(1)
  })

  it('tolerates junk in the stored JSON', () => {
    expect(mergeHistory('not an array', point(80))).toEqual([point(80)])
    expect(mergeHistory([{ nope: true }, point(60)], point(80))).toEqual([point(60), point(80)])
  })

  it('caps the series and keeps the most recent points', () => {
    const prior = Array.from({ length: 20 }, (_, i) => point(i))
    const merged = mergeHistory(prior, point(999))
    expect(merged).toHaveLength(12)
    expect(merged.at(-1)).toEqual(point(999))
    expect(merged[0]).toEqual(point(9)) // oldest 9 dropped
  })
})

/* -------------------------------------------------------------------------- */
/* Scheduler period maths                                                     */
/* -------------------------------------------------------------------------- */

describe('periodDaysFor', () => {
  it('maps each cadence, defaulting unknown values to a week', () => {
    expect(periodDaysFor('WEEKLY')).toBe(7)
    expect(periodDaysFor('BIWEEKLY')).toBe(14)
    expect(periodDaysFor('MONTHLY')).toBe(30)
    expect(periodDaysFor('CUSTOM')).toBe(7)
    expect(periodDaysFor('whatever')).toBe(7)
  })
})

describe('periodStart', () => {
  it('floors a weekly period to local Monday midnight', () => {
    const now = new Date('2026-08-25T10:00:00.000Z') // a Tuesday, in UTC
    const start = periodStart(now, 7, 'UTC')
    expect(start.getUTCDay()).toBe(1) // Monday
    expect(start.getUTCHours()).toBe(0)
    expect(start.getUTCMinutes()).toBe(0)
    expect(start.getTime()).toBeLessThanOrEqual(now.getTime())
    expect(now.getTime() - start.getTime()).toBeLessThan(7 * 24 * 60 * 60 * 1000)
  })

  it('floors a monthly period to N days before local midnight (UTC)', () => {
    const now = new Date('2026-08-25T10:00:00.000Z')
    expect(periodStart(now, 30, 'UTC').toISOString()).toBe('2026-07-26T00:00:00.000Z')
  })

  it('computes the boundary in the school timezone, not the server one', () => {
    // 10:00 UTC is 15:30 in Kolkata; local midnight is 18:30 UTC the day before,
    // so 30 days earlier lands at 18:30 UTC — proof the offset is applied.
    const now = new Date('2026-08-25T10:00:00.000Z')
    expect(periodStart(now, 30, 'Asia/Kolkata').toISOString()).toBe('2026-07-25T18:30:00.000Z')
  })
})

/* -------------------------------------------------------------------------- */
/* Permissions & privacy                                                      */
/* -------------------------------------------------------------------------- */

const REFRESH_KEYS = [
  'teacher_refresh.view_self',
  'teacher_refresh.take',
  'teacher_refresh.manage',
  'teacher_refresh.view_department',
  'teacher_refresh.view_school',
  'teacher_refresh.configure',
  'teacher_refresh.question_review',
]

function grants(roleKey: string): string[] {
  return SYSTEM_ROLES.find((r) => r.key === roleKey)!.permissions
}

describe('teacher-refresh permissions', () => {
  it('registers exactly the expected keys in the catalogue', () => {
    for (const key of REFRESH_KEYS) expect(isValidPermission(key)).toBe(true)
    const inCatalogue = PERMISSION_KEYS.filter((k) => k.startsWith('teacher_refresh.'))
    expect(new Set(inCatalogue)).toEqual(new Set(REFRESH_KEYS))
  })

  it('gives a teacher only their own refreshers — not oversight or config', () => {
    const teacher = grants(ROLE.TEACHER)
    expect(teacher).toContain('teacher_refresh.view_self')
    expect(teacher).toContain('teacher_refresh.take')
    expect(teacher).not.toContain('teacher_refresh.manage')
    expect(teacher).not.toContain('teacher_refresh.configure')
    expect(teacher).not.toContain('teacher_refresh.view_school')
    expect(teacher).not.toContain('teacher_refresh.view_department')
  })

  it('gives a principal oversight but not a teacher’s own take/self surfaces', () => {
    const principal = grants(ROLE.PRINCIPAL)
    expect(principal).toContain('teacher_refresh.view_school')
    expect(principal).toContain('teacher_refresh.view_department')
    expect(principal).toContain('teacher_refresh.manage')
    expect(principal).toContain('teacher_refresh.configure')
    expect(principal).not.toContain('teacher_refresh.take')
    expect(principal).not.toContain('teacher_refresh.view_self')
  })

  it('never exposes any refresh permission to parents or students', () => {
    for (const key of [ROLE.PARENT, ROLE.STUDENT]) {
      const offending = grants(key).filter((p) => p.startsWith('teacher_refresh.'))
      expect(offending, `${key} must hold no teacher_refresh permission`).toEqual([])
    }
  })

  it('lets a school admin hold the whole family', () => {
    const admin = new Set(grants(ROLE.SCHOOL_ADMIN))
    for (const key of REFRESH_KEYS) expect(admin.has(key)).toBe(true)
  })
})
