import { describe, expect, it } from 'vitest'
import {
  assessmentCreateSchema,
  blueprintOf,
  placeSchema,
  placementUpdateSchema,
  sectionCreateSchema,
} from '../src/server/modules/assessments/service'
import { DEFAULT_ASSESSMENT_TYPES } from '../src/lib/assessments'
import { PERMISSIONS } from '../src/lib/rbac/permissions'
import { SYSTEM_ROLES, ROLE } from '../src/lib/rbac/roles'
import { TENANT_SCOPED_MODELS } from '../src/server/db/tenant-models'

function paper(marks: number[], declared: number) {
  return {
    totalMarks: declared,
    sections: [
      {
        questions: marks.map((value) => ({
          marks: value,
          typeSnapshot: 'MCQ',
          difficultySnapshot: 'MEDIUM',
        })),
      },
    ],
  }
}

describe('blueprint arithmetic', () => {
  it('reports a balanced paper as balanced', () => {
    const result = blueprintOf(paper([1, 1, 1, 1, 1, 5, 5, 5, 5, 5, 10], 40))
    expect(result.placed).toBe(40)
    expect(result.declared).toBe(40)
    expect(result.difference).toBe(0)
    expect(result.balanced).toBe(true)
  })

  it('catches a paper that falls short', () => {
    const result = blueprintOf(paper([10, 10, 18], 40))
    expect(result.placed).toBe(38)
    expect(result.difference).toBe(-2)
    expect(result.balanced).toBe(false)
  })

  it('catches a paper that overshoots', () => {
    const result = blueprintOf(paper([20, 25], 40))
    expect(result.difference).toBe(5)
    expect(result.balanced).toBe(false)
  })

  it('survives half marks without floating point noise', () => {
    const result = blueprintOf(paper([0.5, 0.5, 0.5, 0.5, 0.5, 0.5], 3))
    expect(result.placed).toBe(3)
    expect(result.balanced).toBe(true)
  })

  it('treats an empty paper as unbalanced against a real total', () => {
    const result = blueprintOf(paper([], 40))
    expect(result.questionCount).toBe(0)
    expect(result.balanced).toBe(false)
  })

  it('counts questions by type and difficulty', () => {
    const result = blueprintOf({
      totalMarks: 10,
      sections: [
        {
          questions: [
            { marks: 5, typeSnapshot: 'MCQ', difficultySnapshot: 'EASY' },
            { marks: 5, typeSnapshot: 'LONG', difficultySnapshot: 'EASY' },
          ],
        },
      ],
    })
    expect(result.byType).toEqual({ MCQ: 1, LONG: 1 })
    expect(result.byDifficulty).toEqual({ EASY: 2 })
  })

  it('adds up across sections, not just within one', () => {
    const result = blueprintOf({
      totalMarks: 30,
      sections: [
        { questions: [{ marks: 10, typeSnapshot: 'MCQ', difficultySnapshot: 'EASY' }] },
        { questions: [{ marks: 20, typeSnapshot: 'LONG', difficultySnapshot: 'HARD' }] },
      ],
    })
    expect(result.placed).toBe(30)
    expect(result.balanced).toBe(true)
  })
})

describe('assessment input validation', () => {
  const base = {
    classSubjectId: 'cs1',
    assessmentTypeId: 't1',
    title: 'Unit Test I',
    totalMarks: 40,
    durationMinutes: 60,
  }

  it('accepts a well-formed paper', () => {
    expect(assessmentCreateSchema.safeParse(base).success).toBe(true)
  })

  it('rejects a paper worth nothing', () => {
    expect(assessmentCreateSchema.safeParse({ ...base, totalMarks: 0 }).success).toBe(false)
  })

  it('rejects an implausibly short duration', () => {
    expect(assessmentCreateSchema.safeParse({ ...base, durationMinutes: 1 }).success).toBe(false)
  })

  it('rejects a two-character title', () => {
    expect(assessmentCreateSchema.safeParse({ ...base, title: 'UT' }).success).toBe(false)
  })

  it('needs a name for a section', () => {
    expect(sectionCreateSchema.safeParse({ assessmentId: 'a1', title: '' }).success).toBe(false)
    expect(sectionCreateSchema.safeParse({ assessmentId: 'a1', title: 'Section A' }).success).toBe(
      true,
    )
  })

  it('will not place an empty list of questions', () => {
    expect(placeSchema.safeParse({ sectionId: 's1', questionIds: [] }).success).toBe(false)
  })

  it('will not set a placement below half a mark', () => {
    expect(placementUpdateSchema.safeParse({ marks: 0 }).success).toBe(false)
    expect(placementUpdateSchema.safeParse({ marks: 2.5 }).success).toBe(true)
  })
})

describe('assessment types', () => {
  it('covers every test type in the specification', () => {
    const keys = DEFAULT_ASSESSMENT_TYPES.map((type) => type.key)
    for (const key of [
      'DAILY', 'PRACTICE', 'WEEKLY', 'FORTNIGHTLY', 'MONTHLY', 'UNIT_TEST',
      'CHAPTER_TEST', 'MID_TERM', 'QUARTERLY', 'HALF_YEARLY', 'PRE_BOARD',
      'FINAL', 'MOCK', 'CUSTOM',
    ]) {
      expect(keys).toContain(key)
    }
  })

  it('has no duplicate keys', () => {
    const keys = DEFAULT_ASSESSMENT_TYPES.map((type) => type.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('assessment wiring', () => {
  it('registers the permissions', () => {
    const keys = PERMISSIONS.map((p) => p.key)
    for (const key of [
      'assessments.view',
      'assessments.create',
      'assessments.edit',
      'assessments.delete',
      'assessments.approve',
      'assessments.export',
    ]) {
      expect(keys).toContain(key)
    }
  })

  it('gives teachers the papers they set', () => {
    const teacher = SYSTEM_ROLES.find((r) => r.key === ROLE.TEACHER)
    expect(teacher?.permissions).toContain('assessments.create')
    expect(teacher?.permissions).toContain('assessments.approve')
  })

  it('lets a student sit a paper and nothing else', () => {
    const student = SYSTEM_ROLES.find((r) => r.key === ROLE.STUDENT)
    expect(student?.permissions).toContain('assessments.attempt')

    // The rest of the module is the teacher's. A student holding
    // assessments.view could read the paper before it opened.
    for (const key of ['view', 'create', 'edit', 'delete', 'approve', 'assign', 'export']) {
      expect(student?.permissions).not.toContain(`assessments.${key}`)
    }
  })

  it('keeps parents out of the module entirely', () => {
    const parent = SYSTEM_ROLES.find((r) => r.key === ROLE.PARENT)
    expect(parent?.permissions.some((p) => p.startsWith('assessments.'))).toBe(false)
  })

  it('registers every model with the tenant client', () => {
    for (const model of [
      'Assessment',
      'AssessmentSection',
      'AssessmentQuestion',
      'AssessmentType',
      'PaperTemplate',
      'QuestionUsage',
    ]) {
      expect(TENANT_SCOPED_MODELS).toContain(model)
    }
  })
})
