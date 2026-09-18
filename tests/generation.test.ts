import { describe, expect, it } from 'vitest'
import { generateSchema, screenGenerated, TRANSFORMS } from '../src/server/modules/questions/generate'
import { PERMISSIONS } from '../src/lib/rbac/permissions'
import { SYSTEM_ROLES, ROLE } from '../src/lib/rbac/roles'

const allowedTopicIds = new Set(['t1', 't2'])
const allowedTypes = ['MCQ', 'SHORT'] as const

function question(overrides: Record<string, unknown> = {}) {
  return {
    topicId: 't1',
    text: 'State the three laws of motion.',
    type: 'SHORT',
    difficulty: 'MEDIUM',
    marks: 2,
    solution: 'Newton I, II and III, each stated correctly.',
    ...overrides,
  } as never
}

describe('the off-syllabus screen', () => {
  it('keeps a question from a selected topic', () => {
    const result = screenGenerated([question()], { allowedTopicIds, allowedTypes })
    expect(result.kept).toHaveLength(1)
    expect(result.rejected).toHaveLength(0)
  })

  it('discards a question tagged with a topic that was not selected', () => {
    const result = screenGenerated([question({ topicId: 't9' })], {
      allowedTopicIds,
      allowedTypes,
    })
    expect(result.kept).toHaveLength(0)
    expect(result.rejected).toEqual(['outside the selected syllabus'])
  })

  it('discards a format the teacher did not ask for', () => {
    const result = screenGenerated([question({ type: 'LONG' })], {
      allowedTopicIds,
      allowedTypes,
    })
    expect(result.kept).toHaveLength(0)
    expect(result.rejected).toEqual(['wrong format'])
  })

  it('discards an MCQ with no correct option', () => {
    const result = screenGenerated(
      [
        question({
          type: 'MCQ',
          options: [
            { text: 'Newton', isCorrect: false },
            { text: 'Einstein', isCorrect: false },
          ],
        }),
      ],
      { allowedTopicIds, allowedTypes },
    )
    expect(result.kept).toHaveLength(0)
    expect(result.rejected).toEqual(['no correct option'])
  })

  it('discards an MCQ with a single option', () => {
    const result = screenGenerated(
      [question({ type: 'MCQ', options: [{ text: 'Newton', isCorrect: true }] })],
      { allowedTopicIds, allowedTypes },
    )
    expect(result.kept).toHaveLength(0)
  })

  it('keeps a well-formed MCQ', () => {
    const result = screenGenerated(
      [
        question({
          type: 'MCQ',
          options: [
            { text: 'Newton', isCorrect: true },
            { text: 'Einstein', isCorrect: false },
          ],
        }),
      ],
      { allowedTopicIds, allowedTypes },
    )
    expect(result.kept).toHaveLength(1)
  })

  it('discards empty text', () => {
    const result = screenGenerated([question({ text: '  ' })], { allowedTopicIds, allowedTypes })
    expect(result.kept).toHaveLength(0)
    expect(result.rejected).toEqual(['empty'])
  })

  it('screens a mixed batch independently', () => {
    const result = screenGenerated(
      [question(), question({ topicId: 'nope' }), question({ topicId: 't2' })],
      { allowedTopicIds, allowedTypes },
    )
    expect(result.kept).toHaveLength(2)
    expect(result.rejected).toHaveLength(1)
  })

  it('keeps nothing when no topic is allowed', () => {
    const result = screenGenerated([question()], {
      allowedTopicIds: new Set<string>(),
      allowedTypes,
    })
    expect(result.kept).toHaveLength(0)
  })

  it('keeps a textbook question only when its evidence occurs on the cited page', () => {
    const result = screenGenerated(
      [question({
        topicId: undefined,
        sourcePageNumber: 12,
        evidence: 'Force is equal to mass multiplied by acceleration.',
      })],
      {
        allowedTopicIds: new Set(),
        allowedTypes,
        sourceTextByPage: new Map([
          [12, 'Force is equal to mass multiplied by acceleration. This is Newton’s second law.'],
        ]),
      },
    )
    expect(result.kept).toHaveLength(1)
  })

  it('rejects a textbook question whose evidence is not on the cited page', () => {
    const result = screenGenerated(
      [question({ topicId: undefined, sourcePageNumber: 7, evidence: 'An invented statement.' })],
      {
        allowedTopicIds: new Set(),
        allowedTypes,
        sourceTextByPage: new Map([[7, 'The textbook says something else.']]),
      },
    )
    expect(result.kept).toHaveLength(0)
    expect(result.rejected).toEqual(['not supported by the selected textbook pages'])
  })
})

describe('parseEmitQuestions', () => {
  it('accepts OpenAI strict-mode null optionals', async () => {
    const { parseEmitQuestions } = await import('../src/server/modules/questions/generate')
    const parsed = parseEmitQuestions(
      JSON.stringify({
        questions: [
          {
            topicId: null,
            sourcePageNumber: 3,
            evidence: 'Force equals mass times acceleration.',
            text: 'State Newton’s second law.',
            type: 'SHORT',
            difficulty: 'MEDIUM',
            marks: 2,
            bloomLevel: null,
            options: null,
            solution: 'F = ma',
            explanation: null,
          },
        ],
      }),
    )
    expect(parsed.questions).toHaveLength(1)
    expect(parsed.questions[0]?.type).toBe('SHORT')
    expect(parsed.questions[0]?.sourcePageNumber).toBe(3)
  })

  it('maps display labels and string marks', async () => {
    const { parseEmitQuestions } = await import('../src/server/modules/questions/generate')
    const parsed = parseEmitQuestions(
      JSON.stringify({
        questions: [
          {
            text: 'Which quantity is a vector?',
            type: 'Multiple choice',
            difficulty: 'easy',
            marks: '1',
            solution: 'Force',
            options: [
              { text: 'Force', isCorrect: 'true' },
              { text: 'Speed', isCorrect: false },
              { text: 'Mass', isCorrect: false },
              { text: 'Time', isCorrect: false },
            ],
          },
        ],
      }),
      1,
    )
    expect(parsed.questions[0]?.type).toBe('MCQ')
    expect(parsed.questions[0]?.difficulty).toBe('EASY')
    expect(parsed.questions[0]?.marks).toBe(1)
    expect(parsed.questions[0]?.options?.[0]?.isCorrect).toBe(true)
  })
})

describe('generation request validation', () => {
  const base = { classSubjectId: 'cs1', count: 5, types: ['MCQ'] }

  it('accepts a well-formed request', () => {
    expect(generateSchema.safeParse(base).success).toBe(true)
  })

  it('refuses to generate without a format', () => {
    expect(generateSchema.safeParse({ ...base, types: [] }).success).toBe(false)
  })

  it('caps a single batch', () => {
    expect(generateSchema.safeParse({ ...base, count: 200 }).success).toBe(false)
  })

  it('refuses zero questions', () => {
    expect(generateSchema.safeParse({ ...base, count: 0 }).success).toBe(false)
  })

  it('defaults to no chapter or topic narrowing', () => {
    const parsed = generateSchema.parse(base)
    expect(parsed.chapterIds).toEqual([])
    expect(parsed.topicIds).toEqual([])
  })

  it('requires a bounded page range for textbook generation', () => {
    expect(generateSchema.safeParse({
      ...base,
      sourceMode: 'TEXTBOOK',
      textbookId: 'book-1',
      pageStart: 10,
      pageEnd: 39,
    }).success).toBe(true)
    expect(generateSchema.safeParse({
      ...base,
      sourceMode: 'TEXTBOOK',
      textbookId: 'book-1',
      pageStart: 10,
      pageEnd: 40,
    }).success).toBe(false)
  })

  it('requires paper details when creating a complete draft paper', () => {
    expect(generateSchema.safeParse({ ...base, createPaper: true }).success).toBe(false)
    expect(generateSchema.safeParse({
      ...base,
      createPaper: true,
      assessmentTypeId: 'type-1',
      paperTitle: 'Mid-Term Examination',
      durationMinutes: 90,
    }).success).toBe(true)
  })

  it('accepts a balanced difficulty mix', () => {
    expect(
      generateSchema.safeParse({
        ...base,
        difficultyMix: { easy: 30, medium: 50, hard: 20 },
      }).success,
    ).toBe(true)
  })

  it('rejects a difficulty mix that does not sum to 100', () => {
    expect(
      generateSchema.safeParse({
        ...base,
        difficultyMix: { easy: 30, medium: 50, hard: 10 },
      }).success,
    ).toBe(false)
  })

  it('accepts chapter weightage that sums to 100', () => {
    expect(
      generateSchema.safeParse({
        ...base,
        chapterWeights: [
          { chapterId: 'c1', percent: 60 },
          { chapterId: 'c2', percent: 40 },
        ],
      }).success,
    ).toBe(true)
  })
})

describe('difficulty retargeting in screen', () => {
  it('soft-corrects difficulty to the batch target', () => {
    const result = screenGenerated([question({ difficulty: 'HARD' })], {
      allowedTopicIds,
      allowedTypes,
      requiredDifficulty: 'EASY',
    })
    expect(result.kept).toHaveLength(1)
    expect(result.kept[0]?.difficulty).toBe('EASY')
  })
})

describe('transforms', () => {
  it('covers the rewrite actions offered in the interface', () => {
    for (const key of ['EASIER', 'HARDER', 'SIMPLIFY', 'SIMILAR', 'TO_MCQ', 'TO_DESCRIPTIVE']) {
      expect(TRANSFORMS).toHaveProperty(key)
    }
  })

  it('describes each one as an instruction to the model', () => {
    for (const instruction of Object.values(TRANSFORMS)) {
      expect(instruction.length).toBeGreaterThan(20)
    }
  })
})

describe('generation permissions', () => {
  it('is its own permission, not folded into create', () => {
    const keys = PERMISSIONS.map((p) => p.key)
    expect(keys).toContain('questionbank.generate')
  })

  it('is granted to teachers', () => {
    const teacher = SYSTEM_ROLES.find((r) => r.key === ROLE.TEACHER)
    expect(teacher?.permissions).toContain('questionbank.generate')
  })

  it('is withheld from students and parents', () => {
    for (const key of [ROLE.STUDENT, ROLE.PARENT]) {
      const role = SYSTEM_ROLES.find((r) => r.key === key)
      expect(role?.permissions).not.toContain('questionbank.generate')
    }
  })
})
