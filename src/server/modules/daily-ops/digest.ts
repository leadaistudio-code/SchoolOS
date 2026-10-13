import type { AppContext } from '@/server/context'
import { prisma } from '@/server/db/prisma'
import { tenantDb, type TenantClient } from '@/server/db/tenant-client'
import { notifyTenant } from '@/server/notifications'
import { sendParentMessage } from '@/server/messaging/send'
import { tenantUrl } from '@/server/tenant'
import { audit } from '@/server/audit'
import { istDayBounds } from '@/server/modules/finance/dashboard'
import { coverBoard } from '@/server/modules/substitutions/service'
import { attendanceDate, attendancePercent } from '@/lib/dates'
import { istClock, shortDayLabel } from '@/lib/ist-clock'
import {
  formatEveningDigest,
  formatMorningDigest,
  parseDigestConfig,
  slotDue,
  type DigestConfig,
  type DigestSlot,
  type EveningData,
  type MorningData,
} from '@/lib/daily-digest'

const NAMESPACE = 'daily_digest'
const KEY = 'config'
const RECEIVED = ['SUCCESS', 'PARTIALLY_REFUNDED', 'REFUNDED'] as const
const OPEN_INVOICE = ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] as const

export async function readDigestConfig(db: TenantClient): Promise<{ config: DigestConfig; exists: boolean }> {
  const row = await db.setting.findFirst({ where: { namespace: NAMESPACE, key: KEY }, select: { value: true } })
  return { config: parseDigestConfig(row?.value), exists: !!row }
}

async function writeDigestConfig(tenantId: string, config: DigestConfig) {
  await prisma.setting.upsert({
    where: { tenantId_namespace_key: { tenantId, namespace: NAMESPACE, key: KEY } },
    create: { tenantId, namespace: NAMESPACE, key: KEY, value: config as never },
    update: { value: config as never },
  })
}

export async function getDigestSettings(ctx: AppContext) {
  ctx.require('settings.manage')
  const [{ config, exists }, users] = await Promise.all([
    readDigestConfig(ctx.db),
    ctx.db.user.findMany({
      where: {
        status: 'ACTIVE',
        deletedAt: null,
        roles: { some: { role: { key: { notIn: ['PARENT', 'STUDENT'] } } } },
      },
      orderBy: { firstName: 'asc' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        roles: { select: { role: { select: { name: true } } } },
      },
    }),
  ])
  return {
    config,
    enabled: exists && (config.recipientUserIds.length > 0 || config.extraPhones.length > 0),
    users: users.map((u) => ({
      id: u.id,
      name: `${u.firstName} ${u.lastName}`.trim(),
      phone: u.phone,
      roles: u.roles.map((r) => r.role.name).join(', '),
    })),
  }
}

export async function saveDigestSettings(
  ctx: AppContext,
  input: Omit<DigestConfig, 'lastSent'>,
) {
  ctx.require('settings.manage')
  const { config: current } = await readDigestConfig(ctx.db)
  const allowed = await ctx.db.user.findMany({
    where: { id: { in: input.recipientUserIds } },
    select: { id: true },
  })
  const next = parseDigestConfig({
    ...input,
    recipientUserIds: allowed.map((u) => u.id),
    lastSent: current.lastSent,
  })
  await writeDigestConfig(ctx.tenant.id, next)
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'settings.daily_digest',
    module: 'settings',
    summary: `Daily summary: ${next.recipientUserIds.length + next.extraPhones.length} recipients, morning ${next.morningEnabled ? next.morningTime : 'off'}, evening ${next.eveningEnabled ? next.eveningTime : 'off'}`,
  })
  return next
}

async function pendingCounts(db: TenantClient) {
  const [leave, refunds, parentQueries] = await Promise.all([
    db.leaveRequest.count({ where: { status: 'PENDING' } }),
    db.feeRefund.count({ where: { status: 'PENDING' } }),
    db.parentQuery.count({ where: { status: 'OPEN' } }),
  ])
  return { leave, refunds, parentQueries }
}

async function staffToday(db: TenantClient, iso: string) {
  const onDate = attendanceDate(iso)
  const [active, rows, leaves] = await Promise.all([
    db.staff.count({ where: { deletedAt: null, leftOn: null } }),
    db.staffAttendance.groupBy({ by: ['status'], where: { onDate }, _count: { _all: true } }),
    db.leaveRequest.count({
      where: { applicantType: 'STAFF', status: 'APPROVED', fromDate: { lte: onDate }, toDate: { gte: onDate } },
    }),
  ])
  const by = Object.fromEntries(rows.map((r) => [r.status, r._count._all])) as Record<string, number>
  const present = (by.PRESENT ?? 0) + (by.LATE ?? 0) + (by.HALF_DAY ?? 0)
  const onLeave = Math.max(by.LEAVE ?? 0, leaves)
  const absent = by.ABSENT ?? 0
  const recorded = rows.reduce((t, r) => t + r._count._all, 0)
  // "Not checked in" only means something once the school records staff attendance at all today.
  const notIn = recorded > 0 ? Math.max(0, active - present - onLeave - absent) : 0
  return { active, present, onLeave, absent, notIn }
}

async function studentsToday(db: TenantClient, iso: string) {
  const onDate = attendanceDate(iso)
  const [enrolled, counts, sections, markedSections] = await Promise.all([
    db.enrollment.count({ where: { isCurrent: true, student: { deletedAt: null, status: 'ACTIVE' } } }),
    db.studentAttendance.groupBy({ by: ['status'], where: { onDate }, _count: { _all: true } }),
    db.section.findMany({
      where: { deletedAt: null, enrollments: { some: { isCurrent: true } } },
      select: { id: true, name: true, classLevel: { select: { name: true, numeric: true } } },
    }),
    db.studentAttendance.findMany({ where: { onDate }, select: { sectionId: true }, distinct: ['sectionId'] }),
  ])
  const by = Object.fromEntries(counts.map((r) => [r.status, r._count._all])) as Record<string, number>
  const present = (by.PRESENT ?? 0) + (by.LATE ?? 0) + (by.HALF_DAY ?? 0)
  const absent = by.ABSENT ?? 0
  const done = new Set(markedSections.map((m) => m.sectionId))
  const unmarkedSections = sections
    .filter((s) => !done.has(s.id))
    .sort((a, b) => a.classLevel.numeric - b.classLevel.numeric || a.name.localeCompare(b.name))
    .map((s) => `${s.classLevel.name} ${s.name}`)
  return {
    enrolled,
    present,
    absent,
    marked: present + absent,
    unmarkedSections,
    percent: attendancePercent(by),
  }
}

export async function collectMorning(db: TenantClient, tenantId: string, iso: string): Promise<MorningData> {
  const onDate = attendanceDate(iso)
  const dayEnd = new Date(onDate.getTime() + 86_400_000)
  const [school, students, staff, cover, pending, events] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
    studentsToday(db, iso),
    staffToday(db, iso),
    coverBoard(db, iso),
    pendingCounts(db),
    db.calendarEvent.findMany({
      where: { startsAt: { lt: dayEnd }, endsAt: { gte: onDate } },
      select: { title: true, kind: true },
      take: 5,
    }),
  ])
  return {
    school: school?.name ?? 'School',
    dayLabel: shortDayLabel(iso),
    holiday: events.find((e) => e.kind === 'HOLIDAY')?.title ?? null,
    students: {
      enrolled: students.enrolled,
      present: students.present,
      absent: students.absent,
      marked: students.marked,
      unmarkedSections: students.unmarkedSections,
    },
    staff,
    cover: {
      teachersAway: cover.teachers.length,
      lessons: cover.totals.lessons,
      arranged: cover.totals.arranged + cover.totals.noCoverNeeded,
      open: cover.totals.open,
    },
    pending,
    events: events.filter((e) => e.kind !== 'HOLIDAY').map((e) => e.title),
  }
}

export async function collectEvening(db: TenantClient, tenantId: string, iso: string): Promise<EveningData> {
  const onDate = attendanceDate(iso)
  const bounds = istDayBounds(iso)
  const [tenant, payments, dues, overdue, expenses, students, staff, earlyExits, visitors, pending] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, currency: true } }),
    db.feePayment.groupBy({
      by: ['mode'],
      where: { paidAt: bounds, status: { in: [...RECEIVED] } },
      _sum: { amountMinor: true },
      _count: { _all: true },
    }),
    db.feeInvoice.aggregate({
      where: { status: { in: [...OPEN_INVOICE] }, cancelledAt: null },
      _sum: { balanceMinor: true },
    }),
    db.feeInvoice.aggregate({
      where: { status: { in: [...OPEN_INVOICE] }, cancelledAt: null, dueOn: { lt: onDate } },
      _sum: { balanceMinor: true },
    }),
    db.schoolExpense.aggregate({ where: { expenseDate: onDate, deletedAt: null }, _sum: { amountMinor: true } }),
    studentsToday(db, iso),
    staffToday(db, iso),
    db.gatePass.count({ where: { status: 'EXITED', exitedAt: bounds } }),
    db.visitor.count({ where: { checkInAt: bounds } }),
    pendingCounts(db),
  ])
  return {
    school: tenant?.name ?? 'School',
    dayLabel: shortDayLabel(iso),
    currency: tenant?.currency ?? 'INR',
    collected: {
      totalMinor: payments.reduce((t, p) => t + (p._sum.amountMinor ?? 0), 0),
      receipts: payments.reduce((t, p) => t + p._count._all, 0),
      byMode: payments.map((p) => ({ mode: p.mode, amountMinor: p._sum.amountMinor ?? 0 })),
    },
    dues: { outstandingMinor: dues._sum.balanceMinor ?? 0, overdueMinor: overdue._sum.balanceMinor ?? 0 },
    expensesMinor: expenses._sum.amountMinor ?? 0,
    attendance: { studentPercent: students.percent, staffPresent: staff.present, staffActive: staff.active },
    gate: { earlyExits, visitors },
    pending,
  }
}

export async function buildDigest(tenantId: string, slot: DigestSlot, iso: string) {
  const db = tenantDb(tenantId)
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } })
  const link = tenantUrl(tenant?.slug ?? '', '/')
  return slot === 'morning'
    ? formatMorningDigest(await collectMorning(db, tenantId, iso), link)
    : formatEveningDigest(await collectEvening(db, tenantId, iso), link)
}

async function deliver(
  tenantId: string,
  slot: DigestSlot,
  message: { title: string; body: string },
  recipients: { userIds: string[]; phones: { name: string; phone: string }[] },
) {
  if (recipients.userIds.length > 0) {
    await notifyTenant(tenantId, {
      userIds: recipients.userIds,
      eventKey: `digest.${slot}`,
      title: message.title,
      body: message.body,
      linkUrl: '/',
      channels: ['IN_APP', 'WHATSAPP'],
    })
  }
  let phonesSent = 0
  for (const p of recipients.phones) {
    const r = await sendParentMessage({ to: p.phone, body: `${message.title}\n\n${message.body}` })
    if (r.ok) phonesSent++
    else console.warn('[digest] WhatsApp to extra number failed', { tenantId, slot, error: r.error })
  }
  return { users: recipients.userIds.length, phones: phonesSent }
}

/** Sends a summary now to the person asking — for trying the settings out. */
export async function sendDigestTest(ctx: AppContext, slot: DigestSlot) {
  ctx.require('settings.manage')
  const message = await buildDigest(ctx.tenant.id, slot, istClock().iso)
  await deliver(ctx.tenant.id, slot, message, { userIds: [ctx.user.userId], phones: [] })
  return message
}

export async function previewDigest(ctx: AppContext) {
  ctx.require('settings.manage')
  const iso = istClock().iso
  const [morning, evening] = await Promise.all([
    buildDigest(ctx.tenant.id, 'morning', iso),
    buildDigest(ctx.tenant.id, 'evening', iso),
  ])
  return { morning, evening }
}

/**
 * Called by the scheduler every few minutes. Each school's summary goes out
 * once per slot per day, at or after the time it chose. The day is claimed
 * before sending so two overlapping runs cannot both send it.
 */
export async function runDigestTick(now: Date = new Date()) {
  const clock = istClock(now)
  const live = await prisma.tenant.findMany({
    where: { status: { in: ['TRIAL', 'ACTIVE', 'PAST_DUE'] }, archivedAt: null },
    select: { id: true },
  })
  const rows = await prisma.setting.findMany({
    where: { namespace: NAMESPACE, key: KEY, tenantId: { in: live.map((t) => t.id) } },
    select: { tenantId: true, value: true, updatedAt: true },
  })

  const sent: { tenantId: string; slot: DigestSlot; users: number; phones: number }[] = []
  const failed: { tenantId: string; slot: DigestSlot; error: string }[] = []

  for (const row of rows) {
    const config = parseDigestConfig(row.value)
    if (config.recipientUserIds.length === 0 && config.extraPhones.length === 0) continue

    for (const slot of ['morning', 'evening'] as const) {
      if (!slotDue(config, slot, clock)) continue
      const claimed = { ...config, lastSent: { ...config.lastSent, [slot]: clock.iso } }
      const claim = await prisma.setting.updateMany({
        where: { tenantId: row.tenantId, namespace: NAMESPACE, key: KEY, updatedAt: row.updatedAt },
        data: { value: claimed as never },
      })
      if (claim.count === 0) continue
      config.lastSent = claimed.lastSent
      row.updatedAt = (
        await prisma.setting.findUniqueOrThrow({
          where: { tenantId_namespace_key: { tenantId: row.tenantId, namespace: NAMESPACE, key: KEY } },
          select: { updatedAt: true },
        })
      ).updatedAt

      try {
        if (slot === 'morning') {
          const db = tenantDb(row.tenantId)
          const holiday = await db.calendarEvent.findFirst({
            where: {
              kind: 'HOLIDAY',
              startsAt: { lt: new Date(attendanceDate(clock.iso).getTime() + 86_400_000) },
              endsAt: { gte: attendanceDate(clock.iso) },
            },
            select: { id: true },
          })
          if (holiday) continue
        }
        const message = await buildDigest(row.tenantId, slot, clock.iso)
        const r = await deliver(row.tenantId, slot, message, {
          userIds: config.recipientUserIds,
          phones: config.extraPhones,
        })
        sent.push({ tenantId: row.tenantId, slot, ...r })
      } catch (error) {
        failed.push({ tenantId: row.tenantId, slot, error: error instanceof Error ? error.message : String(error) })
      }
    }
  }
  return { at: `${clock.iso} ${Math.floor(clock.minutes / 60)}:${String(clock.minutes % 60).padStart(2, '0')} IST`, sent, failed }
}
