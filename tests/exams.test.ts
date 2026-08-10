import { describe, expect, it } from 'vitest'
import { examCreateSchema, gradeForPercent, gradingScaleSchema, marksSaveSchema } from '../src/server/modules/exams/service'

describe('exam setup contract', () => {
  const valid = {
    name: 'Term 1 Examination', kind: 'MID_TERM', startsOn: '2026-09-01', endsOn: '2026-09-10',
    classLevelIds: ['class_1'], classSubjectIds: ['subject_1'],
  }

  it('accepts a scheduled exam with classes and papers', () => {
    expect(examCreateSchema.parse(valid).name).toBe('Term 1 Examination')
  })

  it('rejects an examination that ends before it starts', () => {
    expect(() => examCreateSchema.parse({ ...valid, endsOn: '2026-08-31' })).toThrow(/end date/i)
  })

  it('requires at least one class and paper', () => {
    expect(() => examCreateSchema.parse({ ...valid, classLevelIds: [] })).toThrow()
    expect(() => examCreateSchema.parse({ ...valid, classSubjectIds: [] })).toThrow()
  })
})

describe('marks entry contract', () => {
  it('allows a normal score and an absent student', () => {
    const parsed = marksSaveSchema.parse({ rows: [
      { studentId: 'student_1', marksObtained: 19, isAbsent: false },
      { studentId: 'student_2', marksObtained: null, isAbsent: true },
    ] })
    expect(parsed.rows).toHaveLength(2)
  })

  it('rejects a negative score and an empty register', () => {
    expect(() => marksSaveSchema.parse({ rows: [] })).toThrow()
    expect(() => marksSaveSchema.parse({ rows: [{ studentId: 'student_1', marksObtained: -1 }] })).toThrow()
  })
})

describe('grading scale contract', () => {
  const bands = [
    { grade: 'A', minPercent: 75, maxPercent: 100, isPass: true },
    { grade: 'B', minPercent: 33, maxPercent: 74.99, isPass: true },
    { grade: 'D', minPercent: 0, maxPercent: 32.99, isPass: false },
  ]

  it('selects grades at band boundaries', () => {
    expect(gradeForPercent(75, bands)?.grade).toBe('A')
    expect(gradeForPercent(74.99, bands)?.grade).toBe('B')
    expect(gradeForPercent(32.99, bands)?.isPass).toBe(false)
  })

  it('rejects overlapping grade bands', () => {
    expect(() => gradingScaleSchema.parse({ name: 'Invalid', bands: [
      { grade: 'A', minPercent: 60, maxPercent: 100 },
      { grade: 'B', minPercent: 50, maxPercent: 70 },
    ] })).toThrow(/overlap/i)
  })
})
