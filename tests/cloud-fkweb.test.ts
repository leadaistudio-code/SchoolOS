import { describe, expect, it } from 'vitest'
import { parseFkWebDeviceTime } from '../src/server/modules/device-gateway/cloud-ingest'
import { attendanceDateInTimeZone } from '../src/server/modules/device-gateway/process-attendance'

describe('cloud FKWeb device time', () => {
  it('interprets an RS9W wall clock in the tenant timezone', () => {
    expect(
      parseFkWebDeviceTime('2026-09-08 15:30:57', 'Asia/Kolkata')?.toISOString(),
    ).toBe('2026-09-08T10:00:57.000Z')
  })

  it('supports compact device timestamps', () => {
    expect(
      parseFkWebDeviceTime('20260908153057', 'Asia/Kolkata')?.toISOString(),
    ).toBe('2026-09-08T10:00:57.000Z')
  })

  it('preserves timestamps that already include an offset', () => {
    expect(
      parseFkWebDeviceTime('2026-09-08T15:30:57+05:30', 'UTC')?.toISOString(),
    ).toBe('2026-09-08T10:00:57.000Z')
  })

  it('rejects malformed values and invalid timezones', () => {
    expect(parseFkWebDeviceTime('not-a-time', 'Asia/Kolkata')).toBeNull()
    expect(parseFkWebDeviceTime('2026-09-08 15:30:57', 'Not/AZone')).toBeNull()
  })
})

describe('cloud FKWeb attendance date', () => {
  it('uses the school calendar date just after midnight IST', () => {
    const instant = new Date('2026-09-08T19:05:00.000Z')
    expect(attendanceDateInTimeZone(instant, 'Asia/Kolkata').toISOString()).toBe(
      '2026-09-09T00:00:00.000Z',
    )
  })

  it('supports schools in negative-offset timezones', () => {
    const instant = new Date('2026-09-09T02:00:00.000Z')
    expect(attendanceDateInTimeZone(instant, 'America/New_York').toISOString()).toBe(
      '2026-09-08T00:00:00.000Z',
    )
  })
})
