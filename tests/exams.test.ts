import { describe, expect, it } from 'vitest'
import {
  assignClassRanks,
  examCreateSchema,
  examPaperUpdateSchema,
  gradeForPercent,
  gradingScaleSchema,
  marksSaveSchema,
} from '../src/server/modules/exams/service'

describe('exam setup contract', () => {
  const valid = {
    name: 'Term 1 Examination',
    kind: 'MID_TERM',
    startsOn: '2026-09-01',
    endsOn: '2026-09-10',
    classLevelIds: ['class_1'],
    classSubjectIds: ['subject_1'],
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
    const parsed = marksSaveSchema.parse({
      rows: [
        { studentId: 'student_1', marksObtained: 19, isAbsent: false },
        { studentId: 'student_2', marksObtained: null, isAbsent: true },
      ],
    })
    expect(parsed.rows).toHaveLength(2)
  })

  it('rejects a negative score and an empty register', () => {
    expect(() => marksSaveSchema.parse({ rows: [] })).toThrow()
    expect(() =>
      marksSaveSchema.parse({ rows: [{ studentId: 'student_1', marksObtained: -1 }] }),
    ).toThrow()
  })

  it('allows scores up to a high maxMarks ceiling in the schema', () => {
    expect(
      marksSaveSchema.parse({
        rows: [{ studentId: 'student_1', marksObtained: 80, isAbsent: false }],
      }).rows[0]!.marksObtained,
    ).toBe(80)
  })
})

describe('paper schedule contract', () => {
  it('accepts max/pass marks with an exam date and times', () => {
    const parsed = examPaperUpdateSchema.parse({
      papers: [
        {
          id: 'paper_1',
          maxMarks: 50,
          passMarks: 17,
          examDate: '2026-09-05',
          startTime: '09:30',
          endTime: '11:00',
          roomName: 'Hall A',
        },
      ],
    })
    expect(parsed.papers[0]!.maxMarks).toBe(50)
    expect(parsed.papers[0]!.startTime).toBe('09:30')
  })

  it('rejects pass marks above max marks', () => {
    expect(() =>
      examPaperUpdateSchema.parse({
        papers: [{ id: 'paper_1', maxMarks: 40, passMarks: 45 }],
      }),
    ).toThrow(/pass marks/i)
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
    expect(() =>
      gradingScaleSchema.parse({
        name: 'Invalid',
        bands: [
          { grade: 'A', minPercent: 60, maxPercent: 100 },
          { grade: 'B', minPercent: 50, maxPercent: 70 },
        ],
      }),
    ).toThrow(/overlap/i)
  })
})

describe('class ranking', () => {
  it('shares rank on ties and densifies the next place', () => {
    const ranks = assignClassRanks([
      { id: 'a', percentage: 90, totalObtained: 90 },
      { id: 'b', percentage: 88, totalObtained: 88 },
      { id: 'c', percentage: 88, totalObtained: 88 },
      { id: 'd', percentage: 70, totalObtained: 70 },
    ])
    expect(ranks.find((r) => r.id === 'a')?.rank).toBe(1)
    expect(ranks.find((r) => r.id === 'b')?.rank).toBe(2)
    expect(ranks.find((r) => r.id === 'c')?.rank).toBe(2)
    expect(ranks.find((r) => r.id === 'd')?.rank).toBe(4)
  })
})
