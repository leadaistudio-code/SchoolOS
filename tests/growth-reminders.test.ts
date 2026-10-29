import { describe, expect, it } from 'vitest'
import {
  eveningVariables,
  istDayStart,
  meetingVariables,
  morningVariables,
  pendingList,
  reminderSlot,
  scopeBoard,
  splitByDay,
  waParam,
  type Board,
  type BoardFollowUp,
  type BoardMeeting,
  isEscalated,
  isWeeklySlot,
  lastWeek,
  scorecardFocus,
  scorecardVariables,
} from '../src/lib/growth-reminders'
import { isForwardMove, resolveCadence } from '../src/lib/growth-cadence'
import { formatIst, istDateTime } from '../src/lib/ist-clock'
import { parseSalesCommand } from '../src/lib/growth-commands'

const lead = (id: string, schoolName: string, ownerId: string) => ({ id, schoolName, ownerId, lastActivityAt: null })

const ISO = '2026-10-26'
/** 26 Oct 2026, HH:mm IST as a UTC instant. */
const ist = (hhmm: string, dayOffset = 0) =>
  new Date(istDayStart(ISO).getTime() + dayOffset * 86_400_000 + (Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3))) * 60_000)

function follow(over: Partial<BoardFollowUp>): BoardFollowUp {
  return {
    id: Math.random().toString(36).slice(2),
    dueAt: ist('11:00'),
    type: 'CALL',
    priority: 'NORMAL',
    assignedToId: 'u1',
    schoolName: 'DPS Noida',
    schoolOwnerId: null,
    contactName: null,
    contactPhone: null,
    ...over,
  }
}

function meeting(over: Partial<BoardMeeting>): BoardMeeting {
  return {
    id: 'm1',
    startsAt: ist('15:00'),
    meetingType: 'Demo',
    mode: 'ONLINE',
    schoolName: 'Ryan International',
    attendeeIds: [],
    createdById: 'u2',
    contactName: 'Mrs Rao',
    contactPhone: '+919876543210',
    ...over,
  }
}

describe('reminder windows', () => {
  it('opens the morning window at 08:30 IST and the evening one at 18:00', () => {
    expect(reminderSlot(8 * 60 + 29)).toBeNull()
    expect(reminderSlot(8 * 60 + 30)).toBe('morning')
    expect(reminderSlot(10 * 60 + 59)).toBe('morning')
    expect(reminderSlot(11 * 60)).toBeNull()
    expect(reminderSlot(18 * 60)).toBe('evening')
    expect(reminderSlot(21 * 60)).toBeNull()
  })

  it('starts the IST day at 18:30 UTC the evening before', () => {
    expect(istDayStart(ISO).toISOString()).toBe('2026-10-25T18:30:00.000Z')
  })
})

describe('waParam', () => {
  it('flattens newlines and long spaces Meta would reject', () => {
    expect(waParam('a\nb\t c     d')).toBe('a b c d')
  })
  it('never sends an empty parameter', () => {
    expect(waParam('  ')).toBe('-')
    expect(waParam(null)).toBe('-')
  })
  it('truncates long text', () => {
    expect(waParam('x'.repeat(200), 10)).toHaveLength(10)
  })
})

describe('digest content', () => {
  const board: Board = {
    followUps: [
      follow({ dueAt: ist('10:00', -2), schoolName: 'Old Lead', assignedToId: 'u2' }),
      follow({ dueAt: ist('16:00'), priority: 'HIGH', schoolName: 'Hot School' }),
      follow({ dueAt: ist('11:00'), schoolName: 'Normal School' }),
      follow({ dueAt: ist('12:00', 1), schoolName: 'Tomorrow School' }),
      follow({ dueAt: ist('09:00'), assignedToId: null, schoolOwnerId: 'u1', schoolName: 'Owned School' }),
    ],
    meetings: [meeting({}), meeting({ id: 'm2', startsAt: ist('11:00', 1) })],
    doneToday: [
      { assignedToId: 'u1', completedById: 'u1' },
      { assignedToId: 'u2', completedById: 'u2' },
    ],
    needsNextStep: [lead('n1', 'Quiet School', 'u1'), lead('n2', 'Other School', 'u2')],
    goingCold: [lead('c1', 'Cold School', 'u2')],
  }

  it('splits overdue, today and tomorrow on IST days, urgent first', () => {
    const split = splitByDay(board, ISO)
    expect(split.overdue.map((f) => f.schoolName)).toEqual(['Old Lead'])
    expect(split.today.map((f) => f.schoolName)).toEqual(['Hot School', 'Owned School', 'Normal School'])
    expect(split.tomorrow.map((f) => f.schoolName)).toEqual(['Tomorrow School'])
    expect(split.meetingsToday).toHaveLength(1)
    expect(split.meetingsTomorrow).toHaveLength(1)
  })

  it('MINE keeps assigned items and falls back to the school owner', () => {
    const mine = scopeBoard(board, { scope: 'MINE', userId: 'u1' })
    expect(mine.followUps.map((f) => f.schoolName).sort()).toEqual([
      'Hot School',
      'Normal School',
      'Owned School',
      'Tomorrow School',
    ])
    expect(mine.meetings).toHaveLength(0)
    expect(mine.doneToday).toHaveLength(1)
  })

  it('TEAM sees everything', () => {
    expect(scopeBoard(board, { scope: 'TEAM', userId: 'u1' })).toBe(board)
  })

  it('fills the morning template with counts and the most urgent item', () => {
    const vars = morningVariables('Shubham Kumar', ISO, splitByDay(board, ISO))
    expect(vars['1']).toBe('Shubham')
    expect(vars['3']).toBe('3')
    expect(vars['4']).toBe('1')
    expect(vars['5']).toBe('1')
    expect(vars['6']).toContain('Old Lead')
    expect(vars['6']).toContain('2d overdue')
    for (const v of Object.values(vars)) expect(v).not.toMatch(/\n/)
  })

  it('fills the evening template', () => {
    const vars = eveningVariables('Santosh', ISO, splitByDay(board, ISO), 2)
    expect(vars).toMatchObject({ '1': 'Santosh', '2': '2', '3': '3', '4': '1', '5': '2' })
  })

  it('says all clear when nothing is pending', () => {
    const empty: Board = { followUps: [], meetings: [], doneToday: [], needsNextStep: [], goingCold: [] }
    expect(eveningVariables('Aryen', ISO, splitByDay(empty, ISO), 0)['6']).toBe('All clear for today.')
  })

  it('fills the meeting template', () => {
    expect(meetingVariables(meeting({}))).toEqual({
      '1': 'Demo',
      '2': 'Ryan International',
      '3': expect.stringMatching(/3:00/),
      '4': 'Online',
      '5': 'Mrs Rao, +919876543210',
    })
  })

  it('numbers the pending list overdue first and remembers the ids behind the numbers', () => {
    const { text, ids } = pendingList('Aryen', ISO, board, 'https://x/today')
    const lines = text.split('\n')
    expect(lines.find((l) => l.startsWith('1.'))).toContain('Old Lead')
    expect(ids).toHaveLength(4)
    expect(ids[0]).toBe(board.followUps[0]!.id)
    expect(text).toContain('*Meetings today*')
    expect(text).not.toContain('Tomorrow School')
    expect(text).toContain('No next step booked* (2)')
    expect(text).toContain('Cold School')
    expect(text).toContain('https://x/today')
  })

  it('flags follow-ups more than 2 days overdue', () => {
    const late: Board = { ...board, followUps: [follow({ dueAt: ist('10:00', -3), schoolName: 'Very Late' })] }
    expect(pendingList('Aryen', ISO, late, 'u').text).toContain('1. 🔴 Very Late')
    expect(pendingList('Aryen', ISO, board, 'u').text).not.toContain('🔴')
    expect(isEscalated(ist('10:00', -3), ISO)).toBe(true)
    expect(isEscalated(ist('10:00', -2), ISO)).toBe(false)
  })

  it('MINE only lists their own leads without a next step', () => {
    const mine = scopeBoard(board, { scope: 'MINE', userId: 'u1' })
    expect(mine.needsNextStep.map((l) => l.schoolName)).toEqual(['Quiet School'])
    expect(mine.goingCold).toHaveLength(0)
  })

  it('caps the list and says how many more', () => {
    const many: Board = {
      ...board,
      followUps: Array.from({ length: 20 }, (_, i) => follow({ dueAt: ist('11:00'), schoolName: `S${i}` })),
    }
    const { text, ids } = pendingList('Aryen', ISO, many, 'u')
    expect(ids).toHaveLength(15)
    expect(text).toContain('…and 5 more')
  })
})

describe('weekly scorecard', () => {
  it('covers Monday to Sunday of the previous week', () => {
    const week = lastWeek('2026-10-26')
    expect(week.key).toBe('2026-10-19')
    expect(week.from.toISOString()).toBe('2026-10-18T18:30:00.000Z')
    expect(week.to.toISOString()).toBe('2026-10-25T18:30:00.000Z')
    expect(week.label).toBe('19 Oct to 25 Oct')
    expect(lastWeek('2026-10-28').key).toBe('2026-10-19')
  })

  it('only fires on Monday morning', () => {
    expect(isWeeklySlot({ iso: '2026-10-26', minutes: 9 * 60, weekday: 1 })).toBe(true)
    expect(isWeeklySlot({ iso: '2026-10-26', minutes: 12 * 60, weekday: 1 })).toBe(false)
    expect(isWeeklySlot({ iso: '2026-10-27', minutes: 9 * 60, weekday: 2 })).toBe(false)
  })

  it('fills the template and suggests a focus', () => {
    const card = { completed: 12, missed: 3, meetingsBooked: 2, movedForward: 1, newLeads: 5, overdueNow: 4, needsNextStep: 1 }
    const vars = scorecardVariables('Shubham Kumar', '19 Oct to 25 Oct', card)
    expect(vars).toMatchObject({ '1': 'Shubham', '3': '12', '4': '3', '5': '2', '6': '1', '7': '5' })
    expect(vars['8']).toBe('Clear 4 overdue follow-ups and book a next step for 1 lead.')
    expect(scorecardFocus({ ...card, overdueNow: 0, needsNextStep: 0 })).toBe('Keep every lead booked with a next step.')
  })

  it('counts only moves towards a deal as forward', () => {
    expect(isForwardMove('CONTACTED', 'DEMO_COMPLETED')).toBe(true)
    expect(isForwardMove('NEGOTIATION', 'WON')).toBe(true)
    expect(isForwardMove('PROPOSAL_SENT', 'LOST')).toBe(false)
    expect(isForwardMove('DEMO_COMPLETED', 'FOLLOW_UP')).toBe(false)
    expect(isForwardMove(undefined, 'WON')).toBe(false)
  })
})

describe('stage cadence', () => {
  it('uses defaults and lets saved rows override them', () => {
    const rules = resolveCadence([{ stage: 'PROPOSAL_SENT', days: 5, followUpType: 'CALL', enabled: false }])
    expect(rules.find((r) => r.stage === 'DEMO_COMPLETED')).toMatchObject({ days: 2, enabled: true })
    expect(rules.find((r) => r.stage === 'PROPOSAL_SENT')).toMatchObject({ days: 5, enabled: false })
    expect(rules.find((r) => r.stage === 'MEETING_SCHEDULED')?.enabled).toBe(false)
  })
})

describe('IST parsing and display', () => {
  it('reads form values as India time', () => {
    expect(istDateTime('2026-10-29', '11:00')?.toISOString()).toBe('2026-10-29T05:30:00.000Z')
    expect(istDateTime('2026-10-29T11:00')?.toISOString()).toBe('2026-10-29T05:30:00.000Z')
    expect(istDateTime('2026-10-29')?.toISOString()).toBe('2026-10-29T04:30:00.000Z')
    expect(istDateTime('2026-10-29T05:30:00.000Z')?.toISOString()).toBe('2026-10-29T05:30:00.000Z')
    expect(istDateTime('not a date')).toBeNull()
    expect(istDateTime('2026-10-29', '25:00')).toBeNull()
  })

  it('formats in India time whatever the machine zone', () => {
    expect(formatIst(new Date('2026-10-29T05:30:00.000Z'), 'd MMM, HH:mm')).toBe('29 Oct, 11:00')
    expect(formatIst(new Date('2026-10-29T20:00:00.000Z'), 'd MMM')).toBe('30 Oct')
  })
})

describe('WhatsApp replies', () => {
  it.each([
    ['Show my list', { kind: 'list' }],
    ['list', { kind: 'list' }],
    ['Hi', { kind: 'list' }],
    ['help', { kind: 'help' }],
    ['done 1', { kind: 'done', items: [1] }],
    ['Done 1, 3', { kind: 'done', items: [1, 3] }],
    ['done 2 4', { kind: 'done', items: [2, 4] }],
    ['tomorrow 2', { kind: 'snooze', items: [2], days: 1 }],
    ['week 3', { kind: 'snooze', items: [3], days: 7 }],
    ['next week 3', { kind: 'snooze', items: [3], days: 7 }],
    ['snooze 2', { kind: 'snooze', items: [2], days: 1 }],
    ['snooze 2 3', { kind: 'snooze', items: [2], days: 3 }],
    ['snooze 2,4 3 days', { kind: 'snooze', items: [2, 4], days: 3 }],
    ['book 1 3', { kind: 'book', item: 1, days: 3 }],
    ['book 1', { kind: 'book', item: 1, days: 2 }],
    ['note 1 Asked for revised quote', { kind: 'note', item: 1, text: 'Asked for revised quote' }],
    ['what is this', { kind: 'unknown' }],
    ['done', { kind: 'unknown' }],
  ])('%s', (text, expected) => {
    expect(parseSalesCommand(text)).toEqual(expected)
  })

  it('keeps snooze within 60 days', () => {
    expect(parseSalesCommand('snooze 1 99')).toEqual({ kind: 'snooze', items: [1], days: 60 })
  })
})
