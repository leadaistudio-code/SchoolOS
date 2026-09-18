import { describe, expect, it } from 'vitest'
import { enqueueSheetSchema, reviewAnswerSchema } from '@/server/modules/evaluation/service'

describe('answer sheet enqueue validation', () => {
  it('accepts a normal upload payload', () => {
    expect(
      enqueueSheetSchema.safeParse({
        assignmentId: 'assign123456',
        studentId: 'student12345',
        pageCount: 3,
      }).success,
    ).toBe(true)
  })

  it('rejects zero pages', () => {
    expect(
      enqueueSheetSchema.safeParse({
        assignmentId: 'assign123456',
        studentId: 'student12345',
        pageCount: 0,
      }).success,
    ).toBe(false)
  })
})

describe('evaluated answer review validation', () => {
  it('accepts approve without marks', () => {
    expect(reviewAnswerSchema.safeParse({ reviewStatus: 'APPROVED' }).success).toBe(true)
  })

  it('accepts override with marks', () => {
    expect(
      reviewAnswerSchema.safeParse({
        reviewStatus: 'OVERRIDDEN',
        teacherMarks: 4.5,
        teacherFeedback: 'Awarded method marks',
      }).success,
    ).toBe(true)
  })

  it('rejects unknown status', () => {
    expect(reviewAnswerSchema.safeParse({ reviewStatus: 'DONE' }).success).toBe(false)
  })
})
