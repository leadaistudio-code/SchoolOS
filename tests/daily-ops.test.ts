import { describe, expect, it } from 'vitest'
import { planAutoCover, rankSubstitutes, type CoverCandidate } from '@/lib/substitutions'
import { DEFAULT_DIGEST, formatEveningDigest, formatMorningDigest, parseDigestConfig, slotDue } from '@/lib/daily-digest'
import { istClock } from '@/lib/ist-clock'
import { maskPhone, phoneKey } from '@/lib/phone'

const teacher = (id: string, over: Partial<CoverCandidate> = {}): CoverCandidate => ({
  id,
  name: id,
  subjectIds: new Set(),
  classLevelIds: new Set(),
  busyPeriodIds: new Set(),
  lessonsToday: 0,
  coverToday: 0,
  coverThisWeek: 0,
  maxPerDay: null,
  ...over,
})

describe('substitute ranking', () => {
  const lesson = { periodId: 'p1', subjectId: 'maths', classLevelId: 'c6' }

  it('puts a free teacher of the same subject first', () => {
    const ranked = rankSubstitutes(lesson, [teacher('art'), teacher('maths2', { subjectIds: new Set(['maths']) })])
    expect(ranked[0]!.id).toBe('maths2')
    expect(ranked[0]!.reasons).toContain('Teaches this subject')
  })

  it('never suggests a teacher who is busy, at their daily cap, or already taken this period', () => {
    const ranked = rankSubstitutes(
      lesson,
      [
        teacher('busy', { busyPeriodIds: new Set(['p1']) }),
        teacher('capped', { lessonsToday: 5, maxPerDay: 5 }),
        teacher('taken'),
        teacher('free'),
      ],
      new Set(['taken']),
    )
    expect(ranked.map((r) => r.id)).toEqual(['free'])
  })

  it('prefers whoever has done less cover this week', () => {
    const ranked = rankSubstitutes(lesson, [teacher('tired', { coverThisWeek: 3 }), teacher('fresh')])
    expect(ranked[0]!.id).toBe('fresh')
  })

  it('auto-cover spreads lessons in the same period across different teachers', () => {
    const plan = planAutoCover(
      [
        { key: 'a', periodId: 'p1', subjectId: null, classLevelId: 'c1' },
        { key: 'b', periodId: 'p1', subjectId: null, classLevelId: 'c2' },
      ],
      [teacher('x'), teacher('y')],
    )
    expect(new Set(plan.values()).size).toBe(2)
  })
})

describe('daily summary schedule', () => {
  const cfg = { ...DEFAULT_DIGEST, recipientUserIds: ['u1'] }
  const at = (iso: string, minutes: number, weekday = 1) => ({ iso, minutes, weekday })

  it('is due at the chosen time and within three hours after', () => {
    expect(slotDue(cfg, 'morning', at('2026-10-05', 9 * 60 + 29))).toBe(false)
    expect(slotDue(cfg, 'morning', at('2026-10-05', 9 * 60 + 30))).toBe(true)
    expect(slotDue(cfg, 'morning', at('2026-10-05', 12 * 60 + 30))).toBe(true)
    expect(slotDue(cfg, 'morning', at('2026-10-05', 12 * 60 + 31))).toBe(false)
  })

  it('does not send twice a day, on Sundays when skipped, or when turned off', () => {
    expect(slotDue({ ...cfg, lastSent: { morning: '2026-10-05' } }, 'morning', at('2026-10-05', 600))).toBe(false)
    expect(slotDue(cfg, 'morning', at('2026-10-04', 600, 7))).toBe(false)
    expect(slotDue({ ...cfg, eveningEnabled: false }, 'evening', at('2026-10-05', 18 * 60))).toBe(false)
  })

  it('falls back to defaults for junk stored config', () => {
    const c = parseDigestConfig({ morningTime: 'soon', extraPhones: [{ name: 'x', phone: '12' }] })
    expect(c.morningTime).toBe('09:30')
    expect(c.extraPhones).toEqual([])
  })

  it('reads the clock in India time', () => {
    const c = istClock(new Date('2026-10-04T20:00:00Z'))
    expect(c.iso).toBe('2026-10-05')
    expect(c.minutes).toBe(90)
    expect(c.weekday).toBe(1)
  })
})

describe('daily summary wording', () => {
  it('morning summary flags unmarked sections and open cover', () => {
    const m = formatMorningDigest(
      {
        school: 'Green Valley',
        dayLabel: 'Mon 5 Oct',
        holiday: null,
        students: { enrolled: 500, present: 450, absent: 20, marked: 470, unmarkedSections: ['6 A'] },
        staff: { active: 40, present: 36, onLeave: 2, absent: 1, notIn: 1 },
        cover: { teachersAway: 3, lessons: 9, arranged: 7, open: 2 },
        pending: { leave: 1, refunds: 0, parentQueries: 2 },
        events: [],
      },
      'https://x',
    )
    expect(m.body).toContain('450/470 present')
    expect(m.body).toContain('Not marked: 6 A')
    expect(m.body).toContain('2 periods still need a substitute')
    expect(m.body).toContain('2 parent queries')
  })

  it('evening summary shows collections by mode', () => {
    const e = formatEveningDigest(
      {
        school: 'Green Valley',
        dayLabel: 'Mon 5 Oct',
        currency: 'INR',
        collected: { totalMinor: 1500000, receipts: 4, byMode: [{ mode: 'CASH', amountMinor: 500000 }, { mode: 'UPI', amountMinor: 1000000 }] },
        dues: { outstandingMinor: 0, overdueMinor: 0 },
        expensesMinor: 0,
        attendance: { studentPercent: 94.5, staffPresent: 38, staffActive: 40 },
        gate: { earlyExits: 1, visitors: 3 },
        pending: { leave: 0, refunds: 0, parentQueries: 0 },
      },
      'https://x',
    )
    expect(e.body).toContain('4 receipts')
    expect(e.body).toMatch(/UPI .*Cash/)
    expect(e.body).toContain('1 early exit · 3 visitors')
  })
})

describe('phone numbers', () => {
  it('matches the same line however it is written', () => {
    for (const raw of ['98765 43210', '+91-98765-43210', '919876543210', 'whatsapp:+919876543210']) {
      expect(phoneKey(raw)).toBe('9876543210')
    }
    expect(phoneKey('12345')).toBeNull()
    expect(maskPhone('+919876543210')).toBe('******3210')
  })
})
