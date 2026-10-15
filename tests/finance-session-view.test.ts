import { describe, expect, it, vi } from 'vitest'

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }),
}))

const { toViewSession, withSessionPeriod, periodOrSession, ALL_DATES } = await import('../src/server/view-session')
const { feeStatusOf } = await import('../src/server/modules/finance/student-fee-report')

const row = (startsOn: string, endsOn: string, isCurrent = false) => ({
  id: 's1',
  name: '2025-26',
  startsOn: new Date(`${startsOn}T00:00:00Z`),
  endsOn: new Date(`${endsOn}T00:00:00Z`),
  isCurrent,
})

describe('viewed session', () => {
  it('runs a session in progress up to today, not to its last day', () => {
    const view = toViewSession(row('2026-04-01', '2027-03-31', true), '2026-10-14')
    expect(view.range).toEqual({ from: '2026-04-01', to: '2026-10-14' })
  })

  it('keeps a current session that was never rolled over running to today', () => {
    const view = toViewSession(row('2025-04-01', '2026-03-31', true), '2026-10-14')
    expect(view.range).toEqual({ from: '2025-04-01', to: '2026-10-14' })
  })

  it('covers the whole of a past session', () => {
    const view = toViewSession(row('2025-04-01', '2026-03-31'), '2026-10-14')
    expect(view.range).toEqual({ from: '2025-04-01', to: '2026-03-31' })
  })

  it('defaults an unfiltered list to the session dates', () => {
    const view = toViewSession(row('2025-04-01', '2026-03-31'), '2026-10-14')
    expect(withSessionPeriod({}, view)).toEqual({ from: '2025-04-01', to: '2026-03-31' })
  })

  it('leaves explicit dates and presets alone', () => {
    const view = toViewSession(row('2025-04-01', '2026-03-31'), '2026-10-14')
    expect(withSessionPeriod({ preset: 'this_month' }, view)).toEqual({ preset: 'this_month' })
    expect(withSessionPeriod({ from: '2024-01-01' }, view)).toEqual({ from: '2024-01-01' })
  })

  it('lifts the date limit for "All dates"', () => {
    const view = toViewSession(row('2025-04-01', '2026-03-31'), '2026-10-14')
    expect(withSessionPeriod({ preset: ALL_DATES }, view)).toEqual({ preset: undefined })
  })

  it('changes nothing before any session exists', () => {
    expect(withSessionPeriod({}, null)).toEqual({})
    expect(periodOrSession(null, undefined, undefined)).toEqual({ from: undefined, to: undefined })
  })
})

describe('fee status per student', () => {
  it('classifies from billed, paid and balance', () => {
    expect(feeStatusOf(0, 0, 0)).toBe('none')
    expect(feeStatusOf(10_000, 10_000, 0)).toBe('paid')
    expect(feeStatusOf(10_000, 4_000, 6_000)).toBe('partial')
    expect(feeStatusOf(10_000, 0, 10_000)).toBe('unpaid')
  })

  it('treats a concession that clears the balance as paid', () => {
    expect(feeStatusOf(10_000, 0, 0)).toBe('paid')
  })
})
