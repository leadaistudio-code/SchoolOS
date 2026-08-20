import { describe, expect, it } from 'vitest'
import {
  promotionApplySchema,
  promotionPlanSchema,
  studentDocumentCreateSchema,
  studentDocumentFilterSchema,
} from '../src/server/modules/students/schema'
import {
  documentCategoryLabel,
  expiryState,
  REQUIRED_DOCUMENT_KEYS,
  STUDENT_DOCUMENT_CATEGORIES,
} from '../src/lib/student-documents'

describe('promotion plan input', () => {
  it('requires both ends and a class', () => {
    const result = promotionPlanSchema.safeParse({ fromSessionId: 'a' })
    expect(result.success).toBe(false)
  })

  it('accepts a whole-class plan with no section', () => {
    const result = promotionPlanSchema.safeParse({
      fromSessionId: 'a',
      toSessionId: 'b',
      fromClassLevelId: 'c',
    })
    expect(result.success).toBe(true)
    expect(result.success && result.data.fromSectionId).toBeUndefined()
  })
})

describe('promotion apply input', () => {
  const decision = { studentId: 's1', decision: 'PROMOTE' as const, toSectionId: 'sec1' }

  it('refuses to promote a session into itself', () => {
    const result = promotionApplySchema.safeParse({
      fromSessionId: 'same',
      toSessionId: 'same',
      decisions: [decision],
    })
    expect(result.success).toBe(false)
    expect(!result.success && result.error.issues[0]?.message).toMatch(/different session/i)
  })

  it('defaults roll numbering to issuing fresh ones', () => {
    const result = promotionApplySchema.parse({
      fromSessionId: 'a',
      toSessionId: 'b',
      decisions: [decision],
    })
    expect(result.rollPolicy).toBe('continue')
  })

  it('rejects an unknown decision', () => {
    const result = promotionApplySchema.safeParse({
      fromSessionId: 'a',
      toSessionId: 'b',
      decisions: [{ studentId: 's1', decision: 'EXPEL' }],
    })
    expect(result.success).toBe(false)
  })

  it('caps a single run at one class worth of students', () => {
    const many = Array.from({ length: 501 }, (_, i) => ({
      studentId: `s${i}`,
      decision: 'PROMOTE' as const,
      toSectionId: 'sec1',
    }))
    const result = promotionApplySchema.safeParse({
      fromSessionId: 'a',
      toSessionId: 'b',
      decisions: many,
    })
    expect(result.success).toBe(false)
  })

  it('allows leaving decisions with no destination', () => {
    const result = promotionApplySchema.safeParse({
      fromSessionId: 'a',
      toSessionId: 'b',
      decisions: [{ studentId: 's1', decision: 'GRADUATE' }],
    })
    expect(result.success).toBe(true)
  })
})

describe('student document input', () => {
  it('needs a student, a type and a name', () => {
    expect(studentDocumentCreateSchema.safeParse({}).success).toBe(false)
    expect(
      studentDocumentCreateSchema.safeParse({
        studentId: 's1',
        category: 'BIRTH_CERTIFICATE',
        title: 'Birth certificate',
      }).success,
    ).toBe(true)
  })

  it('coerces an expiry date from the date input', () => {
    const parsed = studentDocumentCreateSchema.parse({
      studentId: 's1',
      category: 'MEDICAL_RECORD',
      title: 'Fitness certificate',
      expiresOn: '2027-03-31',
    })
    expect(parsed.expiresOn?.getUTCFullYear()).toBe(2027)
  })

  it('ignores filter values it does not recognise', () => {
    expect(studentDocumentFilterSchema.safeParse({ verified: 'maybe' }).success).toBe(false)
    expect(studentDocumentFilterSchema.parse({ verified: 'yes' }).verified).toBe('yes')
  })
})

describe('document catalogue', () => {
  it('has a unique key per category', () => {
    const keys = STUDENT_DOCUMENT_CATEGORIES.map((c) => c.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('only marks as required what the catalogue actually defines', () => {
    expect(REQUIRED_DOCUMENT_KEYS.length).toBeGreaterThan(0)
    for (const key of REQUIRED_DOCUMENT_KEYS) {
      expect(STUDENT_DOCUMENT_CATEGORIES.some((c) => c.key === key)).toBe(true)
    }
  })

  it('renders a readable label for a category it has never heard of', () => {
    expect(documentCategoryLabel('BIRTH_CERTIFICATE')).toBe('Birth certificate')
    expect(documentCategoryLabel('SOME_OLD_KEY')).toBe('some old key')
  })
})

describe('document expiry', () => {
  const now = new Date('2026-08-21T00:00:00Z')

  it('treats no expiry date as nothing to chase', () => {
    expect(expiryState(null, now)).toBe('none')
    expect(expiryState(undefined, now)).toBe('none')
  })

  it('flags a date in the past as expired', () => {
    expect(expiryState('2026-08-20', now)).toBe('expired')
  })

  it('warns ahead of the date rather than on it', () => {
    expect(expiryState('2026-09-15', now)).toBe('soon')
    expect(expiryState('2027-01-01', now)).toBe('valid')
  })

  it('ignores a date it cannot read', () => {
    expect(expiryState('not a date', now)).toBe('none')
  })
})
