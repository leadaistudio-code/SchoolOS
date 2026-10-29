import { prisma } from '@/server/db/prisma'
import type { PlatformContext } from '@/server/context'
import { phoneKey } from '@/lib/phone'
import { formatIst, istClock, shiftIso } from '@/lib/ist-clock'
import { parseSalesCommand, SALES_HELP } from '@/lib/growth-commands'
import { pendingList, scopeBoard } from '@/lib/growth-reminders'
import { completeFollowUp, createFollowUp, hasNextStep, logActivity, snoozeFollowUp } from './service'
import { followUpCreateSchema } from './schema'
import { loadBoard, todayUrl } from './jobs'

/** List numbers stay valid this long; after that the rep must ask for a fresh list. */
const LIST_TTL_MS = 24 * 3600_000

type Recipient = Awaited<ReturnType<typeof findRecipient>>

async function findRecipient(from: string) {
  const key = phoneKey(from)
  if (!key) return null
  const candidates = await prisma.crmReminderRecipient.findMany({
    where: { isActive: true, whatsapp: { endsWith: key } },
  })
  return candidates.find((c) => phoneKey(c.whatsapp) === key) ?? null
}

/**
 * Messages from a salesperson's number go to the CRM instead of the parent
 * bot. Returns null for any other number.
 */
export async function crmInboundReply(from: string, text: string, now = new Date()): Promise<string | null> {
  const r = await findRecipient(from)
  if (!r) return null
  try {
    return await handleSalesMessage(r, text, now)
  } catch (error) {
    console.error('[growth-whatsapp] command failed', error)
    return `Sorry, that did not go through: ${error instanceof Error ? error.message : 'unexpected error'}`
  }
}

async function handleSalesMessage(r: NonNullable<Recipient>, text: string, now: Date): Promise<string> {
  const cmd = parseSalesCommand(text)

  if (cmd.kind === 'help') return SALES_HELP
  if (cmd.kind === 'list' || cmd.kind === 'unknown') {
    const list = await freshList(r, now)
    return cmd.kind === 'unknown' ? `Sorry, I didn't get that.\n\n${list}\n\n${SALES_HELP}` : list
  }

  if (!r.userId) {
    return 'Link your CRM login to this number on Platform → Reminders to update follow-ups from WhatsApp.'
  }
  const ctx = await platformContextForUser(r.userId)
  if (!ctx) return 'Your CRM login is inactive. Ask an admin to check it on Platform → Reminders.'

  if (!r.lastListAt || now.getTime() - r.lastListAt.getTime() > LIST_TTL_MS || r.lastListIds.length === 0) {
    return `Those numbers are out of date. Here is your current list:\n\n${await freshList(r, now)}`
  }
  const pick = (n: number) => r.lastListIds[n - 1]
  const wanted = cmd.kind === 'done' || cmd.kind === 'snooze' ? cmd.items : [cmd.item]
  const missing = wanted.filter((n) => !pick(n))
  if (missing.length) {
    return `There is no item ${missing.join(', ')} on your list. Send *list* to see the numbers.`
  }

  const lines: string[] = []

  if (cmd.kind === 'done') {
    for (const n of cmd.items) {
      const f = await followUpFor(pick(n)!)
      if (!f) {
        lines.push(`${n}. Not found`)
        continue
      }
      if (f.status !== 'PENDING') {
        lines.push(`${n}. ${f.school.name} was already closed`)
        continue
      }
      await completeFollowUp(ctx, f.id)
      const booked = await hasNextStep(ctx, f.schoolId, now)
      lines.push(
        booked
          ? `✅ ${n}. ${f.school.name} done`
          : `✅ ${n}. ${f.school.name} done\n⚠️ No next step booked. Reply *book ${n} 3* to call again in 3 days.`,
      )
    }
  }

  if (cmd.kind === 'snooze') {
    for (const n of cmd.items) {
      const f = await followUpFor(pick(n)!)
      if (!f || f.status !== 'PENDING') {
        lines.push(`${n}. ${f?.school.name ?? 'Item'} is already closed`)
        continue
      }
      const moved = await snoozeFollowUp(ctx, f.id, cmd.days)
      lines.push(`⏰ ${n}. ${moved.schoolName} moved to ${formatIst(moved.dueAt, 'EEE d MMM, h:mm a')}`)
    }
  }

  if (cmd.kind === 'book') {
    const f = await followUpFor(pick(cmd.item)!)
    if (!f) return 'That follow-up no longer exists. Send *list* for a fresh list.'
    const due = await createFollowUp(
      ctx,
      f.schoolId,
      followUpCreateSchema.parse({
        dueAt: shiftIso(istClock(now).iso, cmd.days),
        dueTime: '10:00',
        type: 'CALL',
        contactId: f.contactId ?? undefined,
        note: 'Booked from WhatsApp',
      }),
    )
    lines.push(`📅 Call with ${f.school.name} booked for ${formatIst(due.dueAt, 'EEE d MMM, h:mm a')}`)
  }

  if (cmd.kind === 'note') {
    const f = await followUpFor(pick(cmd.item)!)
    if (!f) return 'That follow-up no longer exists. Send *list* for a fresh list.'
    await logActivity(ctx, f.schoolId, {
      type: 'NOTE',
      summary: cmd.text.slice(0, 400),
      contactId: f.contactId ?? undefined,
      body: undefined,
      nextFollowUpOn: undefined,
      nextFollowUpType: undefined,
    })
    lines.push(`📝 Note saved on ${f.school.name}`)
  }

  lines.push('', 'Send *list* for your updated list.')
  return lines.join('\n')
}

async function freshList(r: NonNullable<Recipient>, now: Date) {
  const iso = istClock(now).iso
  const list = pendingList(r.name, iso, scopeBoard(await loadBoard(iso, now), r), todayUrl())
  await prisma.crmReminderRecipient.update({
    where: { id: r.id },
    data: { lastListIds: list.ids, lastListAt: now },
  })
  return list.text
}

function followUpFor(id: string) {
  return prisma.crmFollowUp.findUnique({
    where: { id },
    select: { id: true, status: true, schoolId: true, contactId: true, school: { select: { name: true } } },
  })
}

/** The same context a signed-in operator gets, minus the session. */
async function platformContextForUser(userId: string): Promise<PlatformContext | null> {
  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId: null, deletedAt: null, status: 'ACTIVE' },
    include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
  })
  if (!user) return null
  const permissions = new Set<string>()
  const roleKeys: string[] = []
  for (const ur of user.roles) {
    roleKeys.push(ur.role.key)
    for (const rp of ur.role.permissions) permissions.add(rp.permission.key)
  }
  return {
    db: prisma,
    user: {
      sessionId: 'whatsapp',
      userId: user.id,
      tenantId: null,
      isSuperAdmin: user.isSuperAdmin,
      firstName: user.firstName,
      lastName: user.lastName,
      displayName: user.displayName,
      email: user.email,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      mustChangePassword: false,
      roleKeys,
      permissions,
      impersonatedById: null,
    },
  }
}
