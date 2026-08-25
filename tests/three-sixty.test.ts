import { describe, expect, it, vi } from 'vitest'
import {
  attendanceDonutSlices,
  attendancePercentOf,
  resultsToTrend,
  isSharedFeedback,
  RAG_DONUT_COLOR,
  type AttendanceCounts,
} from '../src/lib/three-sixty'
import { isProfilePhotoMime } from '../src/lib/student-documents'
import { assertStudentAccess } from '../src/server/scope'
import { toErrorResponse, ApiException } from '../src/server/api/response'
import { ForbiddenError, AuthError } from '../src/server/context'
import { ROLE } from '../src/lib/rbac/roles'

const counts = (partial: Partial<AttendanceCounts>): AttendanceCounts => ({
  present: 0,
  late: 0,
  halfDay: 0,
  leave: 0,
  absent: 0,
  ...partial,
})

describe('attendanceDonutSlices', () => {
  it('returns an empty array when nothing is marked, so the donut shows its "No data" ring', () => {
    // A full circle of one colour would read as "100% present"; an empty set is
    // what makes DonutChart fall back to its neutral ring instead.
    expect(attendanceDonutSlices(counts({}))).toEqual([])
  })

  it('drops zero-count statuses rather than drawing zero-width slivers', () => {
    const slices = attendanceDonutSlices(counts({ present: 8, absent: 2 }))
    expect(slices.map((s) => s.key)).toEqual(['present', 'absent'])
  })

  it('paints each status its RAG colour', () => {
    const slices = attendanceDonutSlices(
      counts({ present: 1, late: 1, halfDay: 1, leave: 1, absent: 1 }),
    )
    const byKey = Object.fromEntries(slices.map((s) => [s.key, s.color]))
    expect(byKey.present).toBe(RAG_DONUT_COLOR.present)
    expect(byKey.late).toBe(RAG_DONUT_COLOR.late)
    expect(byKey.halfDay).toBe(RAG_DONUT_COLOR.halfDay)
    expect(byKey.leave).toBe(RAG_DONUT_COLOR.leave)
    expect(byKey.absent).toBe(RAG_DONUT_COLOR.absent)
  })

  it('keeps a stable RAG order, best to worst', () => {
    const slices = attendanceDonutSlices(
      counts({ present: 1, late: 1, halfDay: 1, leave: 1, absent: 1 }),
    )
    expect(slices.map((s) => s.key)).toEqual(['present', 'late', 'halfDay', 'leave', 'absent'])
  })
})

describe('attendancePercentOf', () => {
  it('is null when nothing was marked', () => {
    expect(attendancePercentOf(counts({}))).toBeNull()
  })

  it('is null when the only marked days are approved leave', () => {
    // Leave is excluded from the base, so a window of pure leave has no
    // denominator to divide by — that is genuinely "no reading", not 0%.
    expect(attendancePercentOf(counts({ leave: 5 }))).toBeNull()
  })

  it('counts a half day as half a day present', () => {
    // present 8 + halfDay 2 over 10 marked → (8 + 1) / 10 = 90.
    expect(attendancePercentOf(counts({ present: 8, halfDay: 2 }))).toBe(90)
  })

  it('excludes approved leave from the base rather than counting it against', () => {
    // 8 present, 2 leave: base is 8, all attended → 100, not 80.
    expect(attendancePercentOf(counts({ present: 8, leave: 2 }))).toBe(100)
  })

  it('rounds to one decimal place', () => {
    // 1 present of 3 → 33.333… → 33.3.
    expect(attendancePercentOf(counts({ present: 1, absent: 2 }))).toBe(33.3)
  })

  it('treats a late arrival as present for the day', () => {
    expect(attendancePercentOf(counts({ present: 5, late: 5 }))).toBe(100)
  })
})

describe('resultsToTrend', () => {
  const bandOf = (percentage: number) =>
    resultsToTrend([{ examName: 'x', percentage, grade: null }])[0]!.band

  it('maps the 85 / 70 / 55 boundaries inclusively', () => {
    expect(bandOf(85)).toBe('EXCELLENT')
    expect(bandOf(84.9)).toBe('GOOD')
    expect(bandOf(70)).toBe('GOOD')
    expect(bandOf(69.9)).toBe('FAIR')
    expect(bandOf(55)).toBe('FAIR')
    expect(bandOf(54.9)).toBe('AT_RISK')
    expect(bandOf(0)).toBe('AT_RISK')
  })

  it('rounds the displayed percent to one decimal and carries the grade through', () => {
    const [point] = resultsToTrend([{ examName: 'Term 1', percentage: 87.25, grade: 'A' }])
    expect(point).toMatchObject({ examName: 'Term 1', percent: 87.3, grade: 'A', band: 'EXCELLENT' })
  })

  it('preserves input order and handles an empty set', () => {
    expect(resultsToTrend([])).toEqual([])
    const trend = resultsToTrend([
      { examName: 'A', percentage: 60, grade: null },
      { examName: 'B', percentage: 90, grade: null },
    ])
    expect(trend.map((p) => p.examName)).toEqual(['A', 'B'])
  })
})

describe('isSharedFeedback', () => {
  it('withholds a teacher-only note', () => {
    expect(isSharedFeedback('TEACHER_ONLY')).toBe(false)
  })

  it('shows every other visibility', () => {
    expect(isSharedFeedback('SHARED_WITH_PARENT')).toBe(true)
    expect(isSharedFeedback('SHARED_WITH_STUDENT')).toBe(true)
    expect(isSharedFeedback('')).toBe(true)
  })
})

describe('isProfilePhotoMime', () => {
  // The avatar setters narrow uploadFile's broader allow-list to real images —
  // without this a PDF sent past the `accept` hint would be stored as a photo
  // and render as a broken <img> on every roster and the parent portal.
  it('accepts the three image types an avatar may be', () => {
    expect(isProfilePhotoMime('image/jpeg')).toBe(true)
    expect(isProfilePhotoMime('image/png')).toBe(true)
    expect(isProfilePhotoMime('image/webp')).toBe(true)
  })

  it('refuses the document types uploadFile otherwise allows', () => {
    expect(isProfilePhotoMime('application/pdf')).toBe(false)
    expect(
      isProfilePhotoMime(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
    ).toBe(false)
    expect(isProfilePhotoMime('text/csv')).toBe(false)
    expect(isProfilePhotoMime('image/gif')).toBe(false)
    expect(isProfilePhotoMime('')).toBe(false)
  })
})

describe('profile-photo access denial is a clean 403', () => {
  // The photo proxy (`readFileForCaller`) is the first API route to call
  // `assertStudentAccess`. It used to throw a plain `Error` with an ad-hoc
  // `.status` bolted on, which `toErrorResponse` does not recognise — so a
  // parent loading another child's avatar got a logged 500 instead of a 403.
  // The assert now throws `ForbiddenError`; these lock both halves of that.

  // A minimal context whose scope resolves to "no students": a self-scoped
  // STUDENT role with no matching student row → `accessibleStudentIds` is `[]`,
  // so any id is denied. Only the fields the resolver reads are provided.
  const denyingCtx = () =>
    ({
      user: { userId: 'u1', roleKeys: [ROLE.STUDENT] },
      db: { student: { findFirst: async () => null } },
    }) as unknown as Parameters<typeof assertStudentAccess>[0]

  it('throws ForbiddenError for a student the caller cannot see', async () => {
    await expect(
      assertStudentAccess(denyingCtx(), 'someone-elses-child'),
    ).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('maps that denial to a 403 envelope, not a 500', async () => {
    const err = await assertStudentAccess(denyingCtx(), 'someone-elses-child').catch((e) => e)
    const res = toErrorResponse(err)
    expect(res.status).toBe(403)
  })

  it('honours error classes, never a `.status` bolted onto a bare Error', () => {
    // The exact trap the fix avoids: a plain Error carrying `.status = 403`
    // still falls through to 500. This is why the assert had to throw a class.
    // The 500 path logs the error, so silence it here — it is the point, not a
    // surprise — while still confirming it fired.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const bare = Object.assign(new Error('nope'), { status: 403 })
      expect(toErrorResponse(bare).status).toBe(500)
      expect(spy).toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
    // The classes the responder does understand, for contrast.
    expect(toErrorResponse(new ForbiddenError('x')).status).toBe(403)
    expect(toErrorResponse(new AuthError()).status).toBe(401)
    expect(toErrorResponse(new ApiException(415, 'X', 'x')).status).toBe(415)
  })
})
