import { describe, expect, it } from 'vitest'
import { answerSchema, assignSchema, scoreObjective } from '../src/server/modules/assessments/attempts'
import { PERMISSIONS } from '../src/lib/rbac/permissions'
import { TENANT_SCOPED_MODELS } from '../src/server/db/tenant-models'

const mcq = [
  { text: 'Newton', isCorrect: true },
  { text: 'Einstein', isCorrect: false },
  { text: 'Bohr', isCorrect: false },
]

describe('objective scoring', () => {
  it('awards full marks for the correct option', () => {
    expect(scoreObjective('MCQ', mcq, [0], 2)).toEqual({ isCorrect: true, marksAwarded: 2 })
  })

  it('awards nothing for the wrong option', () => {
    expect(scoreObjective('MCQ', mcq, [1], 2)).toEqual({ isCorrect: false, marksAwarded: 0 })
  })

  it('awards nothing when the question was left blank', () => {
    expect(scoreObjective('MCQ', mcq, [], 2)).toEqual({ isCorrect: false, marksAwarded: 0 })
  })

  it('does not give credit for selecting everything', () => {
    expect(scoreObjective('MCQ', mcq, [0, 1, 2], 2)).toEqual({ isCorrect: false, marksAwarded: 0 })
  })

  it('requires every correct option on a multi-answer question', () => {
    const options = [
      { text: 'a', isCorrect: true },
      { text: 'b', isCorrect: true },
      { text: 'c', isCorrect: false },
    ]
    expect(scoreObjective('MCQ', options, [0, 1], 3)?.isCorrect).toBe(true)
    expect(scoreObjective('MCQ', options, [0], 3)?.isCorrect).toBe(false)
  })

  it('refuses to score a written answer', () => {
    // Deliberate: "photosynthesis" and "photosynthsis" are one answer to a
    // human and two strings here.
    expect(scoreObjective('LONG', null, [], 5)).toBeNull()
    expect(scoreObjective('ONE_WORD', null, [], 1)).toBeNull()
    expect(scoreObjective('FILL_BLANK', null, [], 1)).toBeNull()
  })

  it('refuses to score an objective question with no correct option recorded', () => {
    const broken = [
      { text: 'a', isCorrect: false },
      { text: 'b', isCorrect: false },
    ]
    expect(scoreObjective('MCQ', broken, [0], 2)).toBeNull()
  })
})

describe('assignment validation', () => {
  const base = {
    assessmentId: 'a1',
    sectionId: 's1',
    opensAt: '2026-08-20T09:00:00.000Z',
    dueAt: '2026-08-20T10:00:00.000Z',
  }

  it('accepts a well-formed window', () => {
    expect(assignSchema.safeParse(base).success).toBe(true)
  })

  it('rejects a window that closes before it opens', () => {
    const result = assignSchema.safeParse({ ...base, dueAt: '2026-08-20T08:00:00.000Z' })
    expect(result.success).toBe(false)
  })

  it('rejects a window with no duration at all', () => {
    expect(assignSchema.safeParse({ ...base, dueAt: base.opensAt }).success).toBe(false)
  })

  it('needs a section or a class', () => {
    const { sectionId, ...withoutTarget } = base
    expect(assignSchema.safeParse(withoutTarget).success).toBe(false)
  })

  it('defaults to the conservative online options', () => {
    const parsed = assignSchema.parse(base)
    expect(parsed.shuffleQuestions).toBe(false)
    expect(parsed.allowBack).toBe(true)
    expect(parsed.autoSubmit).toBe(true)
    expect(parsed.attemptLimit).toBe(1)
    expect(parsed.showResultOnSubmit).toBe(false)
  })

  it('caps attempts at a sane number', () => {
    expect(assignSchema.safeParse({ ...base, attemptLimit: 99 }).success).toBe(false)
  })
})

describe('answer autosave validation', () => {
  it('accepts a written answer', () => {
    expect(answerSchema.safeParse({ assessmentQuestionId: 'q1', responseText: 'Because…' }).success).toBe(true)
  })

  it('accepts a chosen option', () => {
    expect(answerSchema.safeParse({ assessmentQuestionId: 'q1', selectedIndexes: [2] }).success).toBe(true)
  })

  it('accepts a cleared answer', () => {
    expect(answerSchema.safeParse({ assessmentQuestionId: 'q1', selectedIndexes: [] }).success).toBe(true)
  })

  it('rejects an answer with no question', () => {
    expect(answerSchema.safeParse({ responseText: 'orphan' }).success).toBe(false)
  })
})

describe('attempt wiring', () => {
  it('registers the permissions', () => {
    const keys = PERMISSIONS.map((p) => p.key)
    expect(keys).toContain('assessments.assign')
    expect(keys).toContain('assessments.attempt')
  })

  it('registers every model with the tenant client', () => {
    for (const model of ['AssessmentAssignment', 'AssessmentAttempt', 'StudentAnswer']) {
      expect(TENANT_SCOPED_MODELS).toContain(model)
    }
  })
})
