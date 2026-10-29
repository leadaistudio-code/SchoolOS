import { FOLLOW_UP_TYPE_LABELS } from '@/lib/growth-crm'
import { ESCALATE_AFTER_DAYS, STALE_ALERT_DAYS } from '@/lib/growth-cadence'
import { formatIst, istDayStart, shiftIso, shortDayLabel, type IstClock } from '@/lib/ist-clock'

export { istDayStart }

/** Meta template names; they must match what is approved in WhatsApp Manager. */
export const CRM_WA_TEMPLATES = {
  morning: 'mcv_sales_morning_0830_am_plan',
  evening: 'mcv_sales_wrapup_600_pm_wrapup',
  meeting: 'mcv_sales_meeting_soon_30_minutes_before_a_meeting',
  weekly: 'mcv_sales_weekly_scorecard',
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

/** Monday 09:00–12:00 IST. */
export const WEEKLY_WINDOW = { weekday: 1, from: 9 * 60, until: 12 * 60 }

export const MEETING_ALERT_MS = 35 * 60_000

export function reminderSlot(istMinutes: number): ReminderSlot | null {
  for (const slot of ['morning', 'evening'] as const) {
    const w = REMINDER_WINDOWS[slot]
    if (istMinutes >= w.from && istMinutes < w.until) return slot
  }
  return null
}

export function isWeeklySlot(clock: IstClock): boolean {
  return clock.weekday === WEEKLY_WINDOW.weekday && clock.minutes >= WEEKLY_WINDOW.from && clock.minutes < WEEKLY_WINDOW.until
}

/** Monday→Monday (IST) of the week before the one containing `iso`. */
export function lastWeek(iso: string) {
  const weekday = new Date(`${iso}T00:00:00.000Z`).getUTCDay() || 7
  const thisMonday = shiftIso(iso, 1 - weekday)
  const monday = shiftIso(thisMonday, -7)
  return {
    key: monday,
    from: istDayStart(monday),
    to: istDayStart(thisMonday),
    label: `${formatIst(istDayStart(monday), 'd MMM')} to ${formatIst(istDayStart(shiftIso(thisMonday, -1)), 'd MMM')}`,
  }
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

export type BoardLead = { id: string; schoolName: string; ownerId: string | null; lastActivityAt: Date | null }

export type Board = {
  /** Pending follow-ups due before the end of tomorrow (IST). */
  followUps: BoardFollowUp[]
  /** Scheduled meetings today and tomorrow (IST). */
  meetings: BoardMeeting[]
  /** Follow-ups completed since 00:00 IST today. */
  doneToday: BoardDone[]
  /** Worked leads with nothing booked. */
  needsNextStep: BoardLead[]
  /** Worked leads untouched for STALE_ALERT_DAYS. */
  goingCold: BoardLead[]
}

export type RecipientScope = { scope: string; userId: string | null }

export function scopeBoard(board: Board, r: RecipientScope): Board {
  if (r.scope !== 'MINE' || !r.userId) return board
  const me = r.userId
  return {
    followUps: board.followUps.filter((f) => (f.assignedToId ?? f.schoolOwnerId) === me),
    meetings: board.meetings.filter((m) => m.attendeeIds.includes(me) || m.createdById === me),
    doneToday: board.doneToday.filter((d) => (d.completedById ?? d.assignedToId) === me),
    needsNextStep: board.needsNextStep.filter((l) => l.ownerId === me),
    goingCold: board.goingCold.filter((l) => l.ownerId === me),
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

/** Overdue oldest first (escalations lead), today's by priority then time. */
export function splitByDay(board: Board, iso: string): DaySplit {
  const start = istDayStart(iso).getTime()
  const end = start + 86_400_000
  const byDue = [...board.followUps].sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())
  const followUps = [...board.followUps].sort(byUrgency)
  const meetings = [...board.meetings].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
  return {
    overdue: byDue.filter((f) => f.dueAt.getTime() < start),
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

/** Whole IST days a follow-up is past due; 0 when due today or later. */
export function overdueDays(dueAt: Date, iso: string): number {
  const start = istDayStart(iso).getTime()
  return dueAt.getTime() < start ? Math.ceil((start - dueAt.getTime()) / 86_400_000) : 0
}

export function isEscalated(dueAt: Date, iso: string): boolean {
  return overdueDays(dueAt, iso) > ESCALATE_AFTER_DAYS
}

export function followUpLabel(f: BoardFollowUp, iso: string): string {
  const type = FOLLOW_UP_TYPE_LABELS[f.type as keyof typeof FOLLOW_UP_TYPE_LABELS] ?? f.type
  const start = istDayStart(iso).getTime()
  const late = overdueDays(f.dueAt, iso)
  const when = late
    ? `${late}d overdue`
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

export const LIST_LIMIT = 15
const LEAD_LIMIT = 5

/**
 * The numbered list for "Show my list" and the digest emails. `ids` are the
 * follow-ups behind the numbers, in order, so replies like "done 2" resolve.
 */
export function pendingList(name: string, iso: string, mine: Board, todayUrl: string): { text: string; ids: string[] } {
  const split = splitByDay(mine, iso)
  const items = [...split.overdue, ...split.today].slice(0, LIST_LIMIT)
  const total = split.overdue.length + split.today.length
  const lines: string[] = [`*${firstName(name)}, your follow-ups (${shortDayLabel(iso)})*`]

  if (items.length === 0) {
    lines.push('', 'Nothing pending today.')
  } else {
    lines.push('')
    items.forEach((f, i) => {
      const phone = f.contactPhone ? ` · ${f.contactPhone}` : ''
      const flag = isEscalated(f.dueAt, iso) ? '🔴 ' : ''
      lines.push(`${i + 1}. ${flag}${followUpLabel(f, iso)}${phone}`)
    })
    if (total > items.length) lines.push(`…and ${total - items.length} more`)
  }

  if (split.meetingsToday.length) {
    lines.push('', '*Meetings today*')
    for (const m of split.meetingsToday) lines.push(`• ${istTime(m.startsAt)} ${m.meetingType} - ${m.schoolName}`)
  }

  leadSection(lines, `⚠️ *No next step booked* (${mine.needsNextStep.length})`, mine.needsNextStep)
  leadSection(lines, `🧊 *Going cold, ${STALE_ALERT_DAYS}+ days quiet* (${mine.goingCold.length})`, mine.goingCold)

  if (items.length) lines.push('', 'Reply *done 1*, *tomorrow 2*, *note 1 …* or *help*.')
  lines.push('', `Open Today: ${todayUrl}`)
  return { text: lines.join('\n'), ids: items.map((f) => f.id) }
}

function leadSection(lines: string[], title: string, leads: BoardLead[]) {
  if (leads.length === 0) return
  lines.push('', title)
  for (const l of leads.slice(0, LEAD_LIMIT)) lines.push(`• ${l.schoolName}`)
  if (leads.length > LEAD_LIMIT) lines.push(`…and ${leads.length - LEAD_LIMIT} more`)
}

export type Scorecard = {
  completed: number
  missed: number
  meetingsBooked: number
  movedForward: number
  newLeads: number
  overdueNow: number
  needsNextStep: number
}

export function scorecardFocus(s: Scorecard): string {
  const parts: string[] = []
  if (s.overdueNow) parts.push(`clear ${s.overdueNow} overdue follow-up${s.overdueNow === 1 ? '' : 's'}`)
  if (s.needsNextStep) parts.push(`book a next step for ${s.needsNextStep} lead${s.needsNextStep === 1 ? '' : 's'}`)
  if (parts.length === 0) return 'Keep every lead booked with a next step.'
  const text = parts.join(' and ')
  return `${text[0]!.toUpperCase()}${text.slice(1)}.`
}

export function scorecardVariables(name: string, weekLabel: string, s: Scorecard): Record<string, string> {
  return {
    '1': waParam(firstName(name), 40),
    '2': waParam(weekLabel, 40),
    '3': String(s.completed),
    '4': String(s.missed),
    '5': String(s.meetingsBooked),
    '6': String(s.movedForward),
    '7': String(s.newLeads),
    '8': waParam(scorecardFocus(s)),
  }
}

export function scorecardText(name: string, weekLabel: string, s: Scorecard, todayUrl: string): string {
  return [
    `*Weekly scorecard for ${firstName(name)} (${weekLabel})*`,
    '',
    `Follow-ups completed: ${s.completed}`,
    `Follow-ups missed: ${s.missed}`,
    `Meetings and demos booked: ${s.meetingsBooked}`,
    `Deals moved forward: ${s.movedForward}`,
    `New leads added: ${s.newLeads}`,
    '',
    `Focus this week: ${scorecardFocus(s)}`,
    '',
    `Open Today: ${todayUrl}`,
  ].join('\n')
}
