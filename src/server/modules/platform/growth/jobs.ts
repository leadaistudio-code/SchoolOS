import { prisma } from '@/server/db/prisma'
import { emailProvider, whatsappProvider } from '@/server/providers'
import { env } from '@/lib/env'
import { istClock, shiftIso } from '@/lib/ist-clock'
import { phoneKey } from '@/lib/phone'
import {
  CRM_WA_TEMPLATES,
  CRM_WA_TEMPLATE_LANG,
  MEETING_ALERT_MS,
  eveningVariables,
  istDayStart,
  istTime,
  meetingVariables,
  morningVariables,
  pendingListText,
  reminderSlot,
  scopeBoard,
  splitByDay,
  type Board,
  type BoardMeeting,
  type ReminderSlot,
} from '@/lib/growth-reminders'

export type GrowthReminderReport = {
  slot: ReminderSlot | null
  whatsapp: number
  emails: number
  meetings: number
  errors: string[]
}

type Recipient = {
  id: string
  name: string
  whatsapp: string | null
  email: string | null
  userId: string | null
  scope: string
  morning: boolean
  evening: boolean
  meetings: boolean
}

/**
 * Daily WhatsApp/email reminders for the sales team listed on
 * /platform/growth/reminders. Morning plan from 08:30 IST, evening wrap-up from
 * 18:00 IST, and a heads-up ~30 minutes before each meeting.
 *
 * Safe to run every 15 minutes: each send is claimed in CrmReminderSend first,
 * and the claim is released when the send fails so the next run retries.
 */
export async function runGrowthCrmReminders(now = new Date()): Promise<GrowthReminderReport> {
  const clock = istClock(now)
  const slot = reminderSlot(clock.minutes)
  const report: GrowthReminderReport = { slot, whatsapp: 0, emails: 0, meetings: 0, errors: [] }

  const recipients = await prisma.crmReminderRecipient.findMany({ where: { isActive: true } })
  if (recipients.length === 0) return report

  if (slot) {
    const due = recipients.filter((r) => r[slot])
    if (due.length > 0) {
      const board = await loadBoard(clock.iso)
      for (const r of due) await sendDigest(r, slot, clock.iso, board, report)
    }
  }

  const soon = await loadMeetings(now, new Date(now.getTime() + MEETING_ALERT_MS))
  for (const meeting of soon) {
    for (const r of recipients) {
      if (!r.meetings) continue
      if (scopeBoard({ followUps: [], meetings: [meeting], doneToday: [] }, r).meetings.length === 0) continue
      await sendMeetingAlert(r, meeting, report)
    }
  }

  return report
}

/** Sends one recipient's digest right now, bypassing the windows and claims. */
export async function sendTestReminder(recipientId: string, slot: ReminderSlot, now = new Date()) {
  const r = await prisma.crmReminderRecipient.findUnique({ where: { id: recipientId } })
  if (!r) throw new Error('Recipient not found')
  const iso = istClock(now).iso
  const mine = scopeBoard(await loadBoard(iso), r)
  const split = splitByDay(mine, iso)
  const results: string[] = []

  if (r.whatsapp) {
    const res = await sendTemplate(r.whatsapp, slot, digestVariables(r, slot, iso, mine))
    results.push(res.ok ? 'WhatsApp sent' : `WhatsApp failed: ${res.error ?? 'unknown error'}`)
  }
  if (r.email) {
    const ok = await sendMail(r.email, digestSubject(slot, split), pendingListText(r.name, iso, split, todayUrl()))
    results.push(ok ? 'Email sent' : 'Email failed')
  }
  return results.length ? results.join(' · ') : 'No WhatsApp number or email on this recipient'
}

/**
 * When a salesperson messages the bot (or taps "Show my list" on a digest),
 * answer with their pending list. Returns null for any other number so the
 * parent bot handles it.
 */
export async function crmInboundReply(from: string, now = new Date()): Promise<string | null> {
  const key = phoneKey(from)
  if (!key) return null
  const candidates = await prisma.crmReminderRecipient.findMany({
    where: { isActive: true, whatsapp: { endsWith: key } },
  })
  const r = candidates.find((c) => phoneKey(c.whatsapp) === key)
  if (!r) return null
  const iso = istClock(now).iso
  const split = splitByDay(scopeBoard(await loadBoard(iso), r), iso)
  return pendingListText(r.name, iso, split, todayUrl())
}

async function sendDigest(r: Recipient, slot: ReminderSlot, iso: string, board: Board, report: GrowthReminderReport) {
  const mine = scopeBoard(board, r)
  const key = `${r.id}:${iso}`

  if (r.whatsapp && (await claim(`wa_${slot}`, key))) {
    const res = await sendTemplate(r.whatsapp, slot, digestVariables(r, slot, iso, mine))
    if (res.ok) report.whatsapp += 1
    else {
      await release(`wa_${slot}`, key)
      report.errors.push(`wa_${slot}:${r.name}:${res.error ?? 'failed'}`)
    }
  }

  if (r.email && (await claim(`mail_${slot}`, key))) {
    const split = splitByDay(mine, iso)
    const ok = await sendMail(r.email, digestSubject(slot, split), pendingListText(r.name, iso, split, todayUrl()))
    if (ok) report.emails += 1
    else {
      await release(`mail_${slot}`, key)
      report.errors.push(`mail_${slot}:${r.name}`)
    }
  }
}

async function sendMeetingAlert(r: Recipient, meeting: BoardMeeting, report: GrowthReminderReport) {
  const key = `${meeting.id}:${r.id}`

  if (r.whatsapp && (await claim('wa_meeting', key))) {
    const res = await whatsappProvider().send({
      to: r.whatsapp,
      body: `${meeting.meetingType} with ${meeting.schoolName} at ${istTime(meeting.startsAt)}`,
      templateName: CRM_WA_TEMPLATES.meeting,
      variables: meetingVariables(meeting),
      language: CRM_WA_TEMPLATE_LANG,
      copyCodeButton: false,
    })
    if (res.ok) report.meetings += 1
    else {
      await release('wa_meeting', key)
      report.errors.push(`wa_meeting:${r.name}:${res.error ?? 'failed'}`)
    }
  }

  if (r.email && (await claim('mail_meeting', key))) {
    const ok = await sendMail(
      r.email,
      `${meeting.meetingType} with ${meeting.schoolName} at ${istTime(meeting.startsAt)}`,
      `${meeting.meetingType} with ${meeting.schoolName} starts at ${istTime(meeting.startsAt)}.\n\n${todayUrl()}`,
    )
    if (!ok) {
      await release('mail_meeting', key)
      report.errors.push(`mail_meeting:${r.name}`)
    }
  }
}

function digestVariables(r: Recipient, slot: ReminderSlot, iso: string, mine: Board) {
  const split = splitByDay(mine, iso)
  return slot === 'morning'
    ? morningVariables(r.name, iso, split)
    : eveningVariables(r.name, iso, split, mine.doneToday.length)
}

function digestSubject(slot: ReminderSlot, split: ReturnType<typeof splitByDay>) {
  const pending = split.today.length + split.overdue.length
  return slot === 'morning'
    ? `Sales plan: ${pending} follow-up${pending === 1 ? '' : 's'}, ${split.meetingsToday.length} meeting${split.meetingsToday.length === 1 ? '' : 's'}`
    : `Wrap-up: ${pending} follow-up${pending === 1 ? '' : 's'} still open`
}

function sendTemplate(to: string, slot: ReminderSlot, variables: Record<string, string>) {
  return whatsappProvider().send({
    to,
    body: Object.values(variables).join(' | '),
    templateName: CRM_WA_TEMPLATES[slot],
    variables,
    language: CRM_WA_TEMPLATE_LANG,
    copyCodeButton: false,
  })
}

function todayUrl() {
  return `${env().APP_URL.replace(/\/$/, '')}/platform/growth/today`
}

async function loadBoard(iso: string): Promise<Board> {
  const todayStart = istDayStart(iso)
  const dayAfter = istDayStart(shiftIso(iso, 2))

  const [followUps, meetings, doneToday] = await Promise.all([
    prisma.crmFollowUp.findMany({
      where: { status: 'PENDING', dueAt: { lt: dayAfter }, school: { deletedAt: null } },
      orderBy: { dueAt: 'asc' },
      select: {
        id: true,
        dueAt: true,
        type: true,
        priority: true,
        assignedToId: true,
        school: { select: { name: true, ownerId: true } },
        contact: { select: { fullName: true, mobile: true, whatsapp: true } },
      },
    }),
    loadMeetings(todayStart, dayAfter),
    prisma.crmFollowUp.findMany({
      where: { status: 'COMPLETED', completedAt: { gte: todayStart } },
      select: { assignedToId: true, completedById: true },
    }),
  ])

  return {
    followUps: followUps.map((f) => ({
      id: f.id,
      dueAt: f.dueAt,
      type: f.type,
      priority: f.priority,
      assignedToId: f.assignedToId,
      schoolName: f.school.name,
      schoolOwnerId: f.school.ownerId,
      contactName: f.contact?.fullName ?? null,
      contactPhone: f.contact?.mobile ?? f.contact?.whatsapp ?? null,
    })),
    meetings,
    doneToday,
  }
}

async function loadMeetings(from: Date, to: Date): Promise<BoardMeeting[]> {
  const rows = await prisma.crmMeeting.findMany({
    where: { status: 'SCHEDULED', startsAt: { gt: from, lte: to }, school: { deletedAt: null } },
    orderBy: { startsAt: 'asc' },
    select: {
      id: true,
      startsAt: true,
      meetingType: true,
      mode: true,
      attendeeIds: true,
      createdById: true,
      contactIds: true,
      school: { select: { name: true } },
    },
  })
  const contactIds = [...new Set(rows.flatMap((m) => m.contactIds.slice(0, 1)))]
  const contacts = contactIds.length
    ? await prisma.crmContact.findMany({
        where: { id: { in: contactIds } },
        select: { id: true, fullName: true, mobile: true, whatsapp: true },
      })
    : []
  const byId = new Map(contacts.map((c) => [c.id, c]))

  return rows.map((m) => {
    const c = m.contactIds[0] ? byId.get(m.contactIds[0]) : undefined
    return {
      id: m.id,
      startsAt: m.startsAt,
      meetingType: m.meetingType,
      mode: m.mode,
      schoolName: m.school.name,
      attendeeIds: m.attendeeIds,
      createdById: m.createdById,
      contactName: c?.fullName ?? null,
      contactPhone: c?.mobile ?? c?.whatsapp ?? null,
    }
  })
}

async function claim(kind: string, targetKey: string): Promise<boolean> {
  try {
    await prisma.crmReminderSend.create({ data: { kind, targetKey } })
    return true
  } catch {
    return false
  }
}

async function release(kind: string, targetKey: string) {
  await prisma.crmReminderSend.deleteMany({ where: { kind, targetKey } })
}

async function sendMail(to: string, subject: string, whatsappText: string): Promise<boolean> {
  const text = whatsappText.replace(/\*/g, '')
  const html = `<p>${text
    .split('\n\n')
    .map((p) => escapeHtml(p).replaceAll('\n', '<br/>'))
    .join('</p><p>')}</p>`
  const result = await emailProvider().send({ to, subject, text, html })
  return result.ok
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
