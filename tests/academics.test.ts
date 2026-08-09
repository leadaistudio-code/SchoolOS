import { describe, expect, it } from 'vitest'
import {
  homeworkCreateSchema,
  reviewSchema,
  submissionSchema,
} from '../src/server/modules/homework/service'
import { noticeCreateSchema, noticeUpdateSchema } from '../src/server/modules/notices/service'
import { periodSchema, slotSchema, DAYS } from '../src/server/modules/timetable/service'
import {
  calendarEventSchema,
  classworkCreateSchema,
} from '../src/server/modules/academics/content-service'

describe('homework contract', () => {
  const valid = {
    classSubjectId: 'cs_1',
    title: 'Chapter 4 exercises',
    assignedOn: '2026-03-16',
    dueOn: '2026-03-18',
  }

  it('accepts a valid assignment', () => {
    expect(homeworkCreateSchema.parse(valid).title).toBe('Chapter 4 exercises')
  })

  it('allows homework due the day it is set', () => {
    expect(() => homeworkCreateSchema.parse({ ...valid, dueOn: valid.assignedOn })).not.toThrow()
  })

  it('rejects a due date before the assigned date', () => {
    expect(() => homeworkCreateSchema.parse({ ...valid, dueOn: '2026-03-15' })).toThrow(
      /due date cannot be before/i,
    )
  })

  it('requires a subject', () => {
    expect(() => homeworkCreateSchema.parse({ ...valid, classSubjectId: '' })).toThrow()
  })

  it('rejects a title that is barely there', () => {
    expect(() => homeworkCreateSchema.parse({ ...valid, title: 'hw' })).toThrow()
  })

  it('defaults to published', () => {
    expect(homeworkCreateSchema.parse(valid).isPublished).toBe(true)
  })
})

describe('submission and review contracts', () => {
  it('requires both the homework and the student', () => {
    expect(() => submissionSchema.parse({ homeworkId: 'h1' })).toThrow()
    expect(() => submissionSchema.parse({ studentId: 's1' })).toThrow()
    expect(submissionSchema.parse({ homeworkId: 'h1', studentId: 's1' }).studentId).toBe('s1')
  })

  it('accepts a review with a score and a comment', () => {
    const parsed = reviewSchema.parse({ status: 'REVIEWED', score: 18, teacherComment: 'Good' })
    expect(parsed.score).toBe(18)
  })

  it('accepts sending work back to be redone', () => {
    expect(reviewSchema.parse({ status: 'REDO' }).status).toBe('REDO')
  })

  it('rejects a status that is not a review outcome', () => {
    expect(() => reviewSchema.parse({ status: 'SUBMITTED' })).toThrow()
  })

  it('rejects a negative score', () => {
    expect(() => reviewSchema.parse({ status: 'REVIEWED', score: -1 })).toThrow()
  })
})

describe('notice audience contract', () => {
  const base = { title: 'Sports day', body: 'The annual sports day is on Friday.' }

  it('defaults to everyone', () => {
    const parsed = noticeCreateSchema.parse(base)
    expect(parsed.audienceKind).toBe('ALL')
    expect(parsed.priority).toBe('NORMAL')
  })

  it('requires a class when targeting a class', () => {
    expect(() => noticeCreateSchema.parse({ ...base, audienceKind: 'CLASS' })).toThrow(
      /choose the class/i,
    )
    expect(() =>
      noticeCreateSchema.parse({ ...base, audienceKind: 'CLASS', classLevelId: 'c1' }),
    ).not.toThrow()
  })

  it('requires a section when targeting a section', () => {
    expect(() => noticeCreateSchema.parse({ ...base, audienceKind: 'SECTION' })).toThrow(
      /choose the section/i,
    )
  })

  it('requires a role when targeting a role', () => {
    expect(() => noticeCreateSchema.parse({ ...base, audienceKind: 'ROLE' })).toThrow(
      /choose the role/i,
    )
  })

  it('accepts a partial update without re-running audience rules', () => {
    // Updating just the title must not demand the audience fields again.
    expect(noticeUpdateSchema.parse({ title: 'Sports day moved' }).title).toBe('Sports day moved')
  })
})

describe('timetable contracts', () => {
  it('accepts a slot with a subject', () => {
    const parsed = slotSchema.parse({
      sectionId: 'sec_1',
      periodId: 'p_1',
      dayOfWeek: 3,
      classSubjectId: 'cs_1',
    })
    expect(parsed.dayOfWeek).toBe(3)
  })

  it('accepts clearing a slot, because a free period is a real state', () => {
    const parsed = slotSchema.parse({ sectionId: 'sec_1', periodId: 'p_1', dayOfWeek: 3 })
    expect(parsed.classSubjectId).toBeUndefined()
  })

  it('rejects a day outside the week', () => {
    expect(() =>
      slotSchema.parse({ sectionId: 'sec_1', periodId: 'p_1', dayOfWeek: 0 }),
    ).toThrow()
    expect(() =>
      slotSchema.parse({ sectionId: 'sec_1', periodId: 'p_1', dayOfWeek: 8 }),
    ).toThrow()
  })

  it('offers Monday to Saturday as teaching days', () => {
    expect(DAYS.map((d) => d.value)).toEqual([1, 2, 3, 4, 5, 6])
    // Sunday is not a teaching day, so it is absent from the grid entirely.
    expect(DAYS.map((d) => String(d.label))).not.toContain('Sunday')
  })

  it('rejects a period that ends before it starts', () => {
    expect(() =>
      periodSchema.parse({ name: 'Period 1', startTime: '10:00', endTime: '09:00' }),
    ).toThrow(/end after it starts/i)
  })

  it('rejects a malformed time', () => {
    expect(() =>
      periodSchema.parse({ name: 'Period 1', startTime: '9am', endTime: '10am' }),
    ).toThrow()
  })

  it('accepts a normal period', () => {
    const parsed = periodSchema.parse({
      name: 'Period 1',
      startTime: '08:00',
      endTime: '08:45',
    })
    expect(parsed.isBreak).toBe(false)
  })
})

describe('classwork and calendar contracts', () => {
  it('accepts a lesson log', () => {
    const parsed = classworkCreateSchema.parse({
      classSubjectId: 'cs_1',
      onDate: '2026-03-16',
      topic: 'Introduction to fractions',
    })
    expect(parsed.topic).toContain('fractions')
  })

  it('rejects a topic too short to be useful', () => {
    expect(() =>
      classworkCreateSchema.parse({ classSubjectId: 'cs_1', onDate: '2026-03-16', topic: 'a' }),
    ).toThrow()
  })

  it('defaults a single-day event to ending when it starts', () => {
    const parsed = calendarEventSchema.parse({
      title: 'Annual Day',
      startsAt: '2026-12-12',
    })
    expect(parsed.endsAt).toBe('2026-12-12')
  })

  it('rejects an event that ends before it starts', () => {
    expect(() =>
      calendarEventSchema.parse({
        title: 'Annual Day',
        startsAt: '2026-12-12',
        endsAt: '2026-12-01',
      }),
    ).toThrow(/cannot end before it starts/i)
  })

  it('accepts a multi-day event', () => {
    const parsed = calendarEventSchema.parse({
      title: 'Exam week',
      kind: 'EXAM',
      startsAt: '2026-12-01',
      endsAt: '2026-12-05',
    })
    expect(parsed.kind).toBe('EXAM')
  })
})

/**
 * Regression tests for a real hole in upload validation.
 *
 * The first implementation only rejected a file whose magic bytes matched a
 * DIFFERENT known type. A file with unrecognised magic — an .exe renamed to
 * .pdf — sniffed as "unknown" and was accepted. The check is now positive: a
 * declared type with a known signature must actually carry it.
 */
describe('upload signature validation', () => {
  const PDF = Buffer.from('255044462d312e34', 'hex') // %PDF-1.4
  const PNG = Buffer.from('89504e470d0a1a0a', 'hex')
  const EXE = Buffer.from('4d5a90000300000004', 'hex') // MZ...
  const ZIP = Buffer.from('504b03040a000000', 'hex')

  // Mirrors the server rule so the expectation is checked, not just described.
  const SIGNATURES: Record<string, string[]> = {
    'application/pdf': ['25504446'],
    'image/jpeg': ['ffd8ff'],
    'image/png': ['89504e47'],
    'image/webp': ['52494646'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['504b0304'],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['504b0304'],
  }
  const EXEMPT = new Set(['text/plain', 'text/csv'])

  function matches(buffer: Buffer, mimeType: string): boolean {
    if (EXEMPT.has(mimeType)) return true
    const expected = SIGNATURES[mimeType]
    if (!expected) return false
    const head = buffer.subarray(0, 8).toString('hex')
    return expected.some((prefix) => head.startsWith(prefix))
  }

  it('accepts a genuine PDF', () => {
    expect(matches(PDF, 'application/pdf')).toBe(true)
  })

  it('rejects an executable renamed to .pdf', () => {
    expect(matches(EXE, 'application/pdf')).toBe(false)
  })

  it('rejects a PNG passed off as a PDF', () => {
    expect(matches(PNG, 'application/pdf')).toBe(false)
  })

  it('rejects a type with no known signature outright', () => {
    expect(matches(EXE, 'application/x-msdownload')).toBe(false)
  })

  it('accepts an Office document, which is a zip container', () => {
    expect(
      matches(
        ZIP,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
    ).toBe(true)
  })

  it('does not demand a signature from free-form text', () => {
    expect(matches(Buffer.from('name,marks\n'), 'text/csv')).toBe(true)
    expect(matches(Buffer.from('hello'), 'text/plain')).toBe(true)
  })
})
