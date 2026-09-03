import { prisma } from '@/server/db/prisma'
import { emailProvider } from '@/server/providers'
import { env } from '@/lib/env'
import { dayKeyKolkata, isFollowUpSoon, isMeetingImminent } from '@/lib/growth-crm'

export type GrowthReminderReport = {
  digests: number
  followUps: number
  meetings: number
  skipped: number
  errors: string[]
}

/**
 * CRM reminders for platform operators.
 *
 * Uses the existing email provider (same as the rest of the product). In-app
 * Notification rows are tenant-scoped, so they are not used here.
 *
 * Safe to run every 15 minutes: each send is keyed in CrmReminderSend.
 */
export async function runGrowthCrmReminders(now = new Date()): Promise<GrowthReminderReport> {
  const report: GrowthReminderReport = { digests: 0, followUps: 0, meetings: 0, skipped: 0, errors: [] }
  const day = dayKeyKolkata(now)
  const base = env().APP_URL.replace(/\/$/, '')
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  const hourEnd = new Date(now.getTime() + 60 * 60_000)

  const operators = await prisma.user.findMany({
    where: { tenantId: null, deletedAt: null, status: 'ACTIVE', email: { not: null } },
    select: { id: true, firstName: true, email: true },
  })

  const [followUpsToday, overdue, meetingsSoon, meetingsToday, tasksOpen] = await Promise.all([
    prisma.crmFollowUp.findMany({
      where: { status: 'PENDING', dueAt: { gte: now, lt: end } },
      include: { school: { select: { id: true, name: true } } },
    }),
    prisma.crmFollowUp.findMany({
      where: { status: 'PENDING', dueAt: { lt: now } },
      include: { school: { select: { id: true, name: true } } },
    }),
    prisma.crmMeeting.findMany({
      where: { status: 'SCHEDULED', startsAt: { gt: now, lte: new Date(now.getTime() + 35 * 60_000) } },
      include: { school: { select: { id: true, name: true } } },
    }),
    prisma.crmMeeting.findMany({
      where: { status: 'SCHEDULED', startsAt: { gte: now, lt: end } },
      include: { school: { select: { id: true, name: true } } },
    }),
    prisma.crmTask.findMany({
      where: {
        status: { in: ['TODO', 'IN_PROGRESS'] },
        OR: [{ dueAt: { lt: end } }, { dueAt: null }],
      },
      include: { school: { select: { id: true, name: true } } },
      take: 80,
    }),
  ])

  for (const user of operators) {
    if (!user.email) continue
    const mineFollow = [...followUpsToday, ...overdue].filter((f) => f.assignedToId === user.id)
    const mineMeet = meetingsToday.filter((m) => m.attendeeIds.includes(user.id) || m.createdById === user.id)
    const mineTasks = tasksOpen.filter((t) => t.ownerId === user.id)
    const actionCount = mineFollow.length + mineMeet.length + mineTasks.length
    if (actionCount === 0) {
      report.skipped += 1
      continue
    }

    if (await claim(`digest`, `${user.id}:${day}`)) {
      const overdueCount = mineFollow.filter((f) => f.dueAt.getTime() < now.getTime()).length
      const lines = [
        `${actionCount} CRM action${actionCount === 1 ? '' : 's'} require attention today.`,
        overdueCount ? `${overdueCount} follow-up${overdueCount === 1 ? '' : 's'} overdue.` : null,
        mineMeet.length ? `${mineMeet.length} meeting${mineMeet.length === 1 ? '' : 's'} still to go.` : null,
        mineTasks.length ? `${mineTasks.length} open task${mineTasks.length === 1 ? '' : 's'}.` : null,
        `${base}/platform/growth/today`,
      ].filter(Boolean)
      const sent = await sendMail(user.email, `${actionCount} CRM actions today`, lines.join('\n\n'))
      if (sent) report.digests += 1
      else report.errors.push(`digest:${user.email}`)
    }
  }

  for (const follow of followUpsToday) {
    if (!isFollowUpSoon(follow.dueAt, now, hourEnd.getTime() - now.getTime())) continue
    const assignee = operators.find((u) => u.id === follow.assignedToId)
    if (!assignee?.email) continue
    if (!(await claim('follow_up', follow.id))) continue
    const sent = await sendMail(
      assignee.email,
      `Follow up with ${follow.school.name}`,
      `Follow up with ${follow.school.name} at ${follow.dueAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}.\n\n${base}/platform/growth/schools/${follow.schoolId}`,
    )
    if (sent) report.followUps += 1
    else report.errors.push(`follow:${follow.id}`)
  }

  for (const meeting of meetingsSoon) {
    if (!isMeetingImminent(meeting.startsAt, now)) continue
    const recipients = operators.filter(
      (u) => u.email && (meeting.attendeeIds.includes(u.id) || meeting.createdById === u.id),
    )
    if (!(await claim('meeting', meeting.id))) continue
    let any = false
    for (const user of recipients) {
      const sent = await sendMail(
        user.email!,
        `${meeting.meetingType} with ${meeting.school.name} starts soon`,
        `${meeting.meetingType} with ${meeting.school.name} starts in 30 minutes.\n\n${base}/platform/growth/schools/${meeting.schoolId}`,
      )
      if (sent) any = true
    }
    if (any) report.meetings += 1
    else report.errors.push(`meeting:${meeting.id}`)
  }

  return report
}

async function claim(kind: string, targetKey: string): Promise<boolean> {
  try {
    await prisma.crmReminderSend.create({ data: { kind, targetKey } })
    return true
  } catch {
    return false
  }
}

async function sendMail(to: string, subject: string, text: string): Promise<boolean> {
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
