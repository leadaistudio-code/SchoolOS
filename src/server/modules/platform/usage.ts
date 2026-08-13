import { prisma } from '@/server/db/prisma'
import { getEntitlements } from '@/server/entitlements'
import { FEATURE } from '@/lib/features'
import type { PlatformContext } from '@/server/context'

const METER_KEYS = {
  students: 'students.active',
  staff: 'staff.active',
  users: 'users.active',
  storage: 'storage.bytes',
  sms: 'sms.sent',
  whatsapp: 'whatsapp.sent',
} as const

function todayPeriod() {
  const d = new Date()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

/** Count live usage and persist today's UsageMetric rows. */
export async function snapshotUsage(_ctx: PlatformContext, tenantId: string) {
  const periodOn = todayPeriod()

  const [students, staff, users, attachments] = await Promise.all([
    prisma.student.count({ where: { tenantId, deletedAt: null, status: 'ACTIVE' } }),
    prisma.staff.count({ where: { tenantId, deletedAt: null } }),
    prisma.user.count({ where: { tenantId, deletedAt: null, status: 'ACTIVE' } }),
    prisma.attachment.aggregate({
      where: { tenantId },
      _sum: { sizeBytes: true },
    }),
  ])

  const monthStart = new Date(Date.UTC(periodOn.getUTCFullYear(), periodOn.getUTCMonth(), 1))
  const [sms, whatsapp] = await Promise.all([
    prisma.notificationDelivery.count({
      where: {
        tenantId,
        channel: 'SMS',
        status: 'SENT',
        sentAt: { gte: monthStart },
      },
    }),
    prisma.notificationDelivery.count({
      where: {
        tenantId,
        channel: 'WHATSAPP',
        status: 'SENT',
        sentAt: { gte: monthStart },
      },
    }),
  ])

  const rows: { key: string; value: bigint }[] = [
    { key: METER_KEYS.students, value: BigInt(students) },
    { key: METER_KEYS.staff, value: BigInt(staff) },
    { key: METER_KEYS.users, value: BigInt(users) },
    { key: METER_KEYS.storage, value: BigInt(attachments._sum.sizeBytes ?? 0) },
    { key: METER_KEYS.sms, value: BigInt(sms) },
    { key: METER_KEYS.whatsapp, value: BigInt(whatsapp) },
  ]

  await prisma.$transaction(
    rows.map(({ key, value }) =>
      prisma.usageMetric.upsert({
        where: { tenantId_key_periodOn: { tenantId, key, periodOn } },
        create: { tenantId, key, value, periodOn },
        update: { value },
      }),
    ),
  )

  return Object.fromEntries(rows.map(({ key, value }) => [key, Number(value)]))
}

export async function recordUsage(tenantId: string, key: string, value: bigint) {
  const periodOn = todayPeriod()
  return prisma.usageMetric.upsert({
    where: { tenantId_key_periodOn: { tenantId, key, periodOn } },
    create: { tenantId, key, value, periodOn },
    update: { value },
  })
}

export async function usageVsLimits(tenantId: string) {
  const periodOn = todayPeriod()
  const entitlements = await getEntitlements(tenantId)

  const metrics = await prisma.usageMetric.findMany({
    where: { tenantId, periodOn },
  })
  const byKey = new Map(metrics.map((m) => [m.key, Number(m.value)]))

  const limitMap: Record<string, { current: number; limit: number | null; label: string }> = {
    students: {
      label: 'Students',
      current: byKey.get(METER_KEYS.students) ?? 0,
      limit: entitlements[FEATURE.LIMIT_STUDENTS]?.limit ?? null,
    },
    staff: {
      label: 'Staff',
      current: byKey.get(METER_KEYS.staff) ?? 0,
      limit: entitlements[FEATURE.LIMIT_STAFF]?.limit ?? null,
    },
    users: {
      label: 'Admin users',
      current: byKey.get(METER_KEYS.users) ?? 0,
      limit: entitlements[FEATURE.LIMIT_ADMIN_USERS]?.limit ?? null,
    },
    storage: {
      label: 'Storage (MB)',
      current: Math.ceil((byKey.get(METER_KEYS.storage) ?? 0) / (1024 * 1024)),
      limit: entitlements[FEATURE.LIMIT_STORAGE_MB]?.limit ?? null,
    },
    sms: {
      label: 'SMS this month',
      current: byKey.get(METER_KEYS.sms) ?? 0,
      limit: entitlements[FEATURE.LIMIT_SMS_PER_MONTH]?.limit ?? null,
    },
    whatsapp: {
      label: 'WhatsApp this month',
      current: byKey.get(METER_KEYS.whatsapp) ?? 0,
      limit: entitlements[FEATURE.LIMIT_WHATSAPP_PER_MONTH]?.limit ?? null,
    },
  }

  return limitMap
}

export async function getTenantUsage(ctx: PlatformContext, tenantId: string) {
  await snapshotUsage(ctx, tenantId)
  return usageVsLimits(tenantId)
}
