import { describe, expect, it } from 'vitest'
import {
  eveningVariables,
  istDayStart,
  meetingVariables,
  morningVariables,
  pendingListText,
  reminderSlot,
  scopeBoard,
  splitByDay,
  waParam,
  type Board,
  type BoardFollowUp,
  type BoardMeeting,
} from '../src/lib/growth-reminders'

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
    const empty: Board = { followUps: [], meetings: [], doneToday: [] }
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

  it('numbers the pending list overdue first', () => {
    const text = pendingListText('Aryen', ISO, splitByDay(board, ISO), 'https://x/today')
    const lines = text.split('\n')
    expect(lines.find((l) => l.startsWith('1.'))).toContain('Old Lead')
    expect(text).toContain('*Meetings today*')
    expect(text).not.toContain('Tomorrow School')
    expect(text).toContain('https://x/today')
  })
})
