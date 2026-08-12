import { describe, expect, it } from 'vitest'
import {
  SIMILARITY_THRESHOLD,
  fingerprintOf,
  normalizeQuestion,
  questionCreateSchema,
  similarity,
} from '../src/server/modules/questions/service'
import { OBJECTIVE_TYPES, QUESTION_TYPES, QUESTION_TYPE_LABEL } from '../src/lib/questions'
import { PERMISSIONS } from '../src/lib/rbac/permissions'
import { TENANT_SCOPED_MODELS } from '../src/server/db/tenant-models'

const base = {
  classSubjectId: 'cs1',
  text: 'State the three laws of motion.',
  marks: 2,
}

describe('question normalisation', () => {
  it('ignores case, punctuation and spacing', () => {
    expect(normalizeQuestion("State Newton's  SECOND law.")).toBe('state newton s second law')
  })

  it('gives the same fingerprint to the same question retyped', () => {
    expect(fingerprintOf('Define photosynthesis.')).toBe(fingerprintOf('  define   Photosynthesis!  '))
  })

  it('gives different fingerprints to different questions', () => {
    expect(fingerprintOf('Define photosynthesis.')).not.toBe(fingerprintOf('Define respiration.'))
  })
})

describe('question similarity', () => {
  it('scores a reworded repeat above the threshold', () => {
    const score = similarity(
      'Explain the process of photosynthesis in green plants.',
      'Describe the process of photosynthesis in green plants.',
    )
    expect(score).toBeGreaterThanOrEqual(SIMILARITY_THRESHOLD)
  })

  it('scores unrelated questions well below it', () => {
    const score = similarity(
      'Explain the process of photosynthesis in green plants.',
      'Calculate the resistance of a copper wire of length two metres.',
    )
    expect(score).toBeLessThan(SIMILARITY_THRESHOLD)
  })

  it('is not fooled by shared question words alone', () => {
    // Both start "Explain the ..."; only the stop words overlap.
    const score = similarity('Explain the water cycle.', 'Explain the reflex arc.')
    expect(score).toBeLessThan(SIMILARITY_THRESHOLD)
  })

  it('returns zero when one side has no content words', () => {
    expect(similarity('the a of is', 'photosynthesis in plants')).toBe(0)
  })
})

describe('question validation by type', () => {
  it('rejects an MCQ with no correct option', () => {
    const result = questionCreateSchema.safeParse({
      ...base,
      type: 'MCQ',
      options: [
        { text: 'Newton', isCorrect: false },
        { text: 'Einstein', isCorrect: false },
      ],
    })
    expect(result.success).toBe(false)
    expect(JSON.stringify(result)).toContain('Mark the correct option')
  })

  it('rejects an MCQ with a single option', () => {
    const result = questionCreateSchema.safeParse({
      ...base,
      type: 'MCQ',
      options: [{ text: 'Only one', isCorrect: true }],
    })
    expect(result.success).toBe(false)
  })

  it('accepts a well-formed MCQ', () => {
    const result = questionCreateSchema.safeParse({
      ...base,
      type: 'MCQ',
      options: [
        { text: 'Newton', isCorrect: true },
        { text: 'Einstein', isCorrect: false },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('requires every match pair to have its right-hand side', () => {
    const result = questionCreateSchema.safeParse({
      ...base,
      type: 'MATCH',
      options: [
        { text: 'Chlorophyll', matchWith: 'Green pigment' },
        { text: 'Stomata' },
      ],
    })
    expect(result.success).toBe(false)
    expect(JSON.stringify(result)).toContain('needs its match')
  })

  it('requires answer points on a long descriptive question', () => {
    const result = questionCreateSchema.safeParse({
      ...base,
      type: 'LONG',
      marks: 5,
    })
    expect(result.success).toBe(false)
    expect(JSON.stringify(result)).toContain('expected answer points')
  })

  it('does not demand answer points on a one-mark question', () => {
    const result = questionCreateSchema.safeParse({ ...base, type: 'VERY_SHORT', marks: 1 })
    expect(result.success).toBe(true)
  })

  it('rejects marks below half a mark', () => {
    expect(questionCreateSchema.safeParse({ ...base, type: 'SHORT', marks: 0 }).success).toBe(false)
  })
})

describe('question vocabulary', () => {
  it('labels every type', () => {
    for (const type of QUESTION_TYPES) {
      expect(QUESTION_TYPE_LABEL[type]).toBeTruthy()
    }
  })

  it('marks only auto-scorable types as objective', () => {
    expect(OBJECTIVE_TYPES).toContain('MCQ')
    expect(OBJECTIVE_TYPES).not.toContain('LONG')
    expect(OBJECTIVE_TYPES).not.toContain('CASE_STUDY')
  })
})

describe('question bank wiring', () => {
  it('registers the permissions', () => {
    const keys = PERMISSIONS.map((p) => p.key)
    for (const key of [
      'questionbank.view',
      'questionbank.create',
      'questionbank.edit',
      'questionbank.delete',
      'questionbank.approve',
      'questionbank.share',
    ]) {
      expect(keys).toContain(key)
    }
  })

  it('registers every model with the tenant client', () => {
    for (const model of ['Question', 'QuestionOption', 'QuestionTopic']) {
      expect(TENANT_SCOPED_MODELS).toContain(model)
    }
  })
})
