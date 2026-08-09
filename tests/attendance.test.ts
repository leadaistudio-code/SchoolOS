import { describe, expect, it } from 'vitest'
import { distanceMeters, evaluateGeofence, formatDistance } from '../src/lib/geo'
import {
  attendanceDate,
  attendancePercent,
  eachDateInRange,
  formatDay,
  isNonWorkingDay,
  isSundayUTC,
  toDateInput,
} from '../src/lib/dates'
import { markAttendanceSchema, MARKABLE_STATUSES } from '../src/server/modules/attendance/schema'
import { leaveApplySchema } from '../src/server/modules/leave/service'

const SCHOOL = { latitude: 28.4595, longitude: 77.0266 }

describe('geofence distance', () => {
  it('returns zero at the same point', () => {
    expect(distanceMeters(SCHOOL, SCHOOL)).toBe(0)
  })

  it('measures a known separation accurately', () => {
    // 0.01 degrees of latitude is ~1111m anywhere on Earth.
    const north = { latitude: SCHOOL.latitude + 0.01, longitude: SCHOOL.longitude }
    const d = distanceMeters(SCHOOL, north)
    expect(d).toBeGreaterThan(1090)
    expect(d).toBeLessThan(1130)
  })

  it('is symmetric', () => {
    const other = { latitude: 28.47, longitude: 77.04 }
    expect(distanceMeters(SCHOOL, other)).toBe(distanceMeters(other, SCHOOL))
  })

  it('formats readably', () => {
    expect(formatDistance(85)).toBe('85m')
    expect(formatDistance(2400)).toBe('2.4km')
  })
})

describe('geofence decision', () => {
  const base = { school: SCHOOL, radiusM: 150 }

  it('admits someone standing on campus', () => {
    const verdict = evaluateGeofence({
      ...base,
      reported: { latitude: 28.4596, longitude: 77.0267 },
      accuracyM: 10,
    })
    expect(verdict.inside).toBe(true)
  })

  it('refuses someone a kilometre away', () => {
    const verdict = evaluateGeofence({
      ...base,
      reported: { latitude: 28.47, longitude: 77.04 },
      accuracyM: 10,
    })
    expect(verdict.inside).toBe(false)
    expect(verdict.reason).toMatch(/from school/i)
  })

  it('gives the benefit of the doubt within the accuracy radius', () => {
    // 200m away but the fix is ±80m: the device could genuinely be inside.
    const verdict = evaluateGeofence({
      ...base,
      reported: { latitude: SCHOOL.latitude + 0.0018, longitude: SCHOOL.longitude },
      accuracyM: 80,
    })
    expect(verdict.distanceM).toBeGreaterThan(150)
    expect(verdict.inside).toBe(true)
  })

  it('refuses a fix too imprecise to mean anything', () => {
    const verdict = evaluateGeofence({
      ...base,
      reported: SCHOOL,
      accuracyM: 5000,
    })
    expect(verdict.inside).toBe(false)
    expect(verdict.reason).toMatch(/accuracy/i)
  })

  it('respects a school-specific radius', () => {
    const reported = { latitude: SCHOOL.latitude + 0.003, longitude: SCHOOL.longitude }
    expect(evaluateGeofence({ school: SCHOOL, radiusM: 150, reported, accuracyM: 5 }).inside).toBe(false)
    expect(evaluateGeofence({ school: SCHOOL, radiusM: 500, reported, accuracyM: 5 }).inside).toBe(true)
  })
})

describe('attendance percentage', () => {
  it('counts late and half days as attended', () => {
    expect(attendancePercent({ PRESENT: 8, LATE: 1, HALF_DAY: 1, ABSENT: 0 })).toBe(100)
  })

  it('computes the usual case', () => {
    expect(attendancePercent({ PRESENT: 18, ABSENT: 2 })).toBe(90)
  })

  it('excludes approved leave and holidays from the denominator', () => {
    // 9 present, 1 absent, 10 on leave -> 90%, not 47%.
    expect(attendancePercent({ PRESENT: 9, ABSENT: 1, LEAVE: 10, HOLIDAY: 5 })).toBe(90)
  })

  it('returns null when nothing was marked', () => {
    expect(attendancePercent({})).toBeNull()
    expect(attendancePercent({ HOLIDAY: 4 })).toBeNull()
  })
})

describe('attendance dates', () => {
  it('normalises a date string to UTC midnight', () => {
    // UTC, deliberately: these are calendar dates in a Postgres `date` column,
    // so normalising through local midnight would shift the stored day.
    const d = attendanceDate('2026-03-15')
    expect(d.getUTCHours()).toBe(0)
    expect(toDateInput(d)).toBe('2026-03-15')
  })

  it('is stable through a round trip', () => {
    expect(toDateInput(attendanceDate('2026-01-01'))).toBe('2026-01-01')
  })

  it('treats Sunday as non-working', () => {
    expect(isNonWorkingDay(attendanceDate('2026-03-15'))).toBe(true) // Sunday
    expect(isNonWorkingDay(attendanceDate('2026-03-16'))).toBe(false)
  })

  it('honours a configured holiday', () => {
    const holidays = new Set(['2026-03-16'])
    expect(isNonWorkingDay(attendanceDate('2026-03-16'), holidays)).toBe(true)
  })

  it('enumerates an inclusive range', () => {
    const days = eachDateInRange(attendanceDate('2026-03-16'), attendanceDate('2026-03-18'))
    expect(days.map(toDateInput)).toEqual(['2026-03-16', '2026-03-17', '2026-03-18'])
  })

  it('handles a single-day range', () => {
    const days = eachDateInRange(attendanceDate('2026-03-16'), attendanceDate('2026-03-16'))
    expect(days).toHaveLength(1)
  })
})

/**
 * Regression tests for a real defect: calendar dates were being normalised
 * through LOCAL midnight. In a positive-offset zone such as IST that is 18:30
 * UTC on the previous day, so saved registers landed a day early, and a value
 * already read from the database shifted again each time it was re-normalised.
 */
describe('calendar dates are timezone-stable', () => {
  it('stores a date string as UTC midnight', () => {
    const d = attendanceDate('2026-07-29')
    expect(d.toISOString()).toBe('2026-07-29T00:00:00.000Z')
  })

  it('does not shift a value that came back from the database', () => {
    // Prisma returns a `@db.Date` column as UTC midnight.
    const fromDb = new Date('2026-07-29T00:00:00.000Z')

    // Re-normalising must be a no-op, however many times it happens.
    expect(attendanceDate(fromDb).toISOString()).toBe(fromDb.toISOString())
    expect(attendanceDate(attendanceDate(fromDb)).toISOString()).toBe(fromDb.toISOString())
    expect(toDateInput(fromDb)).toBe('2026-07-29')
  })

  it('walks a multi-day leave without losing or shifting a day', () => {
    const days = eachDateInRange(
      new Date('2026-07-29T00:00:00.000Z'),
      new Date('2026-07-30T00:00:00.000Z'),
    )
    expect(days.map(toDateInput)).toEqual(['2026-07-29', '2026-07-30'])
  })

  it('keeps the weekday of a stored date', () => {
    // 2026-03-15 is a Sunday in UTC and must read as one regardless of the
    // machine timezone the server happens to run in.
    expect(isSundayUTC(new Date('2026-03-15T00:00:00.000Z'))).toBe(true)
    expect(isSundayUTC(new Date('2026-03-16T00:00:00.000Z'))).toBe(false)
  })

  it('displays the day that was stored', () => {
    expect(formatDay(new Date('2026-07-29T00:00:00.000Z'), 'yyyy-MM-dd')).toBe('2026-07-29')
  })

  it('round-trips every day of a month', () => {
    for (let day = 1; day <= 28; day++) {
      const iso = `2026-02-${String(day).padStart(2, '0')}`
      expect(toDateInput(attendanceDate(iso))).toBe(iso)
    }
  })
})

describe('mark attendance contract', () => {
  const valid = {
    sectionId: 'sec_1',
    onDate: '2026-03-16',
    entries: [{ studentId: 'stu_1', status: 'PRESENT' }],
  }

  it('accepts a valid register', () => {
    expect(markAttendanceSchema.parse(valid).entries).toHaveLength(1)
  })

  it('rejects a malformed date', () => {
    expect(() => markAttendanceSchema.parse({ ...valid, onDate: '16-03-2026' })).toThrow()
  })

  it('rejects an unknown status', () => {
    expect(() =>
      markAttendanceSchema.parse({
        ...valid,
        entries: [{ studentId: 'stu_1', status: 'MAYBE' }],
      }),
    ).toThrow()
  })

  it('rejects an empty register', () => {
    expect(() => markAttendanceSchema.parse({ ...valid, entries: [] })).toThrow()
  })

  it('caps the batch size so one request cannot mark the whole school', () => {
    const entries = Array.from({ length: 201 }, (_, i) => ({
      studentId: `stu_${i}`,
      status: 'PRESENT' as const,
    }))
    expect(() => markAttendanceSchema.parse({ ...valid, entries })).toThrow()
  })

  it('does not offer HOLIDAY as a per-student choice', () => {
    expect(MARKABLE_STATUSES).not.toContain('HOLIDAY')
  })
})

describe('leave application contract', () => {
  const valid = {
    applicantType: 'STUDENT' as const,
    studentId: 'stu_1',
    fromDate: '2026-03-16',
    toDate: '2026-03-18',
    reason: 'Fever, advised rest',
  }

  it('accepts a valid application', () => {
    expect(leaveApplySchema.parse(valid).reason).toContain('Fever')
  })

  it('rejects an end date before the start date', () => {
    expect(() => leaveApplySchema.parse({ ...valid, toDate: '2026-03-15' })).toThrow(
      /end date cannot be before/i,
    )
  })

  it('allows a single-day leave', () => {
    expect(() => leaveApplySchema.parse({ ...valid, toDate: valid.fromDate })).not.toThrow()
  })

  it('requires a student when applying on a student behalf', () => {
    const { studentId: _omit, ...withoutStudent } = valid
    expect(() => leaveApplySchema.parse(withoutStudent)).toThrow(/select the student/i)
  })

  it('does not require a student for staff leave', () => {
    expect(() =>
      leaveApplySchema.parse({
        applicantType: 'STAFF',
        fromDate: '2026-03-16',
        toDate: '2026-03-16',
        reason: 'Personal work',
      }),
    ).not.toThrow()
  })

  it('requires a meaningful reason', () => {
    expect(() => leaveApplySchema.parse({ ...valid, reason: 'ill' })).toThrow()
  })
})
