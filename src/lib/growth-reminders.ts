import { FOLLOW_UP_TYPE_LABELS } from '@/lib/growth-crm'
import { shortDayLabel } from '@/lib/ist-clock'

const IST_OFFSET_MS = 330 * 60_000

/** Meta template names; they must match what is approved in WhatsApp Manager. */
export const CRM_WA_TEMPLATES = {
  morning: 'mcv_sales_morning',
  evening: 'mcv_sales_wrapup',
  meeting: 'mcv_sales_meeting_soon',
} as const

export const CRM_WA_TEMPLATE_LANG = 'en'

export const REMINDER_SCOPES = ['TEAM', 'MINE'] as const
export type ReminderScope = (typeof REMINDER_SCOPES)[number]

export type ReminderSlot = 'morning' | 'evening'

/**
 * The cron runs every 15 minutes, so each digest has a send window rather
 * than an exact minute; the claim row stops it going out twice.
 */
export const REMINDER_WINDOWS: Record<ReminderSlot, { from: number; until: number }> = {
  morning: { from: 8 * 60 + 30, until: 11 * 60 },
  evening: { from: 18 * 60, until: 21 * 60 },
}

export const MEETING_ALERT_MS = 35 * 60_000

export function reminderSlot(istMinutes: number): ReminderSlot | null {
  for (const slot of ['morning', 'evening'] as const) {
    const w = REMINDER_WINDOWS[slot]
    if (istMinutes >= w.from && istMinutes < w.until) return slot
  }
  return null
}

/** UTC instant of 00:00 IST on a YYYY-MM-DD calendar date. */
export function istDayStart(iso: string): Date {
  return new Date(Date.parse(`${iso.slice(0, 10)}T00:00:00.000Z`) - IST_OFFSET_MS)
}

/** Meta rejects template parameters with newlines, tabs or 4+ spaces. */
export function waParam(value: string | null | undefined, max = 120): string {
  const flat = (value ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim()
  if (!flat) return '-'
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat
}

export function istTime(at: Date): string {
  return at.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' })
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name.trim()
}

export type BoardFollowUp = {
  id: string
  dueAt: Date
  type: string
  priority: string
  assignedToId: string | null
  schoolName: string
  schoolOwnerId: string | null
  contactName: string | null
  contactPhone: string | null
}

export type BoardMeeting = {
  id: string
  startsAt: Date
  meetingType: string
  mode: string
  schoolName: string
  attendeeIds: string[]
  createdById: string | null
  contactName: string | null
  contactPhone: string | null
}

export type BoardDone = { assignedToId: string | null; completedById: string | null }

export type Board = {
  /** Pending follow-ups due before the end of tomorrow (IST). */
  followUps: BoardFollowUp[]
  /** Scheduled meetings today and tomorrow (IST). */
  meetings: BoardMeeting[]
  /** Follow-ups completed since 00:00 IST today. */
  doneToday: BoardDone[]
}

export type RecipientScope = { scope: string; userId: string | null }

export function scopeBoard(board: Board, r: RecipientScope): Board {
  if (r.scope !== 'MINE' || !r.userId) return board
  const me = r.userId
  return {
    followUps: board.followUps.filter((f) => (f.assignedToId ?? f.schoolOwnerId) === me),
    meetings: board.meetings.filter((m) => m.attendeeIds.includes(me) || m.createdById === me),
    doneToday: board.doneToday.filter((d) => (d.completedById ?? d.assignedToId) === me),
  }
}

const PRIORITY_RANK: Record<string, number> = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 }

export type DaySplit = {
  overdue: BoardFollowUp[]
  today: BoardFollowUp[]
  tomorrow: BoardFollowUp[]
  meetingsToday: BoardMeeting[]
  meetingsTomorrow: BoardMeeting[]
}

export function splitByDay(board: Board, iso: string): DaySplit {
  const start = istDayStart(iso).getTime()
  const end = start + 86_400_000
  const followUps = [...board.followUps].sort(byUrgency)
  const meetings = [...board.meetings].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
  return {
    overdue: followUps.filter((f) => f.dueAt.getTime() < start),
    today: followUps.filter((f) => f.dueAt.getTime() >= start && f.dueAt.getTime() < end),
    tomorrow: followUps.filter((f) => f.dueAt.getTime() >= end),
    meetingsToday: meetings.filter((m) => m.startsAt.getTime() >= start && m.startsAt.getTime() < end),
    meetingsTomorrow: meetings.filter((m) => m.startsAt.getTime() >= end),
  }
}

function byUrgency(a: BoardFollowUp, b: BoardFollowUp): number {
  const p = (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2)
  return p !== 0 ? p : a.dueAt.getTime() - b.dueAt.getTime()
}

export function followUpLabel(f: BoardFollowUp, iso: string): string {
  const type = FOLLOW_UP_TYPE_LABELS[f.type as keyof typeof FOLLOW_UP_TYPE_LABELS] ?? f.type
  const start = istDayStart(iso).getTime()
  const when =
    f.dueAt.getTime() < start
      ? `${Math.ceil((start - f.dueAt.getTime()) / 86_400_000)}d overdue`
      : f.dueAt.getTime() >= start + 86_400_000
        ? `tomorrow ${istTime(f.dueAt)}`
        : istTime(f.dueAt)
  const who = f.contactName ? ` (${f.contactName})` : ''
  return `${f.schoolName}${who} - ${type}, ${when}`
}

/** What to do first: oldest overdue, else the most urgent item due today. */
function firstItem(split: DaySplit, iso: string): string {
  const top = split.overdue[0] ?? split.today[0]
  if (top) return followUpLabel(top, iso)
  const meeting = split.meetingsToday[0]
  if (meeting) return `${meeting.meetingType} with ${meeting.schoolName} at ${istTime(meeting.startsAt)}`
  return 'Nothing due. Book follow-ups for your open leads.'
}

export function morningVariables(name: string, iso: string, split: DaySplit): Record<string, string> {
  return {
    '1': waParam(firstName(name), 40),
    '2': waParam(shortDayLabel(iso), 40),
    '3': String(split.today.length),
    '4': String(split.overdue.length),
    '5': String(split.meetingsToday.length),
    '6': waParam(firstItem(split, iso)),
  }
}

export function eveningVariables(
  name: string,
  iso: string,
  split: DaySplit,
  doneToday: number,
): Record<string, string> {
  return {
    '1': waParam(firstName(name), 40),
    '2': String(doneToday),
    '3': String(split.today.length),
    '4': String(split.overdue.length),
    '5': String(split.tomorrow.length + split.meetingsTomorrow.length),
    '6': waParam(split.overdue[0] || split.today[0] ? firstItem(split, iso) : 'All clear for today.'),
  }
}

export function meetingVariables(m: BoardMeeting): Record<string, string> {
  const contact = [m.contactName, m.contactPhone].filter(Boolean).join(', ')
  return {
    '1': waParam(m.meetingType, 40),
    '2': waParam(m.schoolName, 80),
    '3': waParam(istTime(m.startsAt), 20),
    '4': m.mode === 'ONLINE' ? 'Online' : 'In person',
    '5': waParam(contact || 'Not added'),
  }
}

const LIST_LIMIT = 15

/** Plain-text numbered list, used for the "Show my list" reply and the emails. */
export function pendingListText(name: string, iso: string, split: DaySplit, todayUrl: string): string {
  const items = [...split.overdue, ...split.today]
  const lines: string[] = [`*${firstName(name)}, your follow-ups (${shortDayLabel(iso)})*`]

  if (items.length === 0) {
    lines.push('', 'Nothing pending today.')
  } else {
    lines.push('')
    items.slice(0, LIST_LIMIT).forEach((f, i) => {
      const phone = f.contactPhone ? ` · ${f.contactPhone}` : ''
      lines.push(`${i + 1}. ${followUpLabel(f, iso)}${phone}`)
    })
    if (items.length > LIST_LIMIT) lines.push(`…and ${items.length - LIST_LIMIT} more`)
  }

  if (split.meetingsToday.length) {
    lines.push('', '*Meetings today*')
    for (const m of split.meetingsToday) {
      lines.push(`• ${istTime(m.startsAt)} ${m.meetingType} - ${m.schoolName}`)
    }
  }

  lines.push('', `Open Today: ${todayUrl}`)
  return lines.join('\n')
}
