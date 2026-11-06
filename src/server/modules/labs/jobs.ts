import { prisma } from '@/server/db/prisma'
import { tenantDb } from '@/server/db/tenant-client'
import { FEATURE, hasFeature } from '@/server/entitlements'
import { notifyTenant } from '@/server/notifications'
import { ROLE } from '@/lib/rbac/roles'
import { labAlerts } from './service'

const EVENT_KEY = 'labs.daily_alerts'

/**
 * Once a day: tell each school's lab in-charge, lab assistants and principal
 * about expired or expiring chemicals, low stock and overdue inspections.
 * Safe to run more than once a day; a school already alerted today is skipped.
 */
export async function runLabAlerts(now = new Date()) {
  const tenantIds = (
    await prisma.lab.findMany({ where: { deletedAt: null }, distinct: ['tenantId'], select: { tenantId: true } })
  ).map((r) => r.tenantId)

  const since = new Date(now.getTime() - 20 * 3_600_000)
  let schools = 0
  let notified = 0
  for (const tenantId of tenantIds) {
    if (!(await hasFeature(tenantId, FEATURE.MODULE_SCIENCE_LAB))) continue
    const already = await prisma.notification.findFirst({
      where: { tenantId, eventKey: EVENT_KEY, createdAt: { gte: since } },
      select: { id: true },
    })
    if (already) continue

    const db = tenantDb(tenantId)
    const labs = await db.lab.findMany({ where: { deletedAt: null } })
    const alerts = (await labAlerts({ db }, labs)).filter((a) => a.kind !== 'incident')
    if (alerts.length === 0) continue

    const staffIds = labs.flatMap((l) => [l.inChargeStaffId, l.assistantStaffId]).filter((x): x is string => !!x)
    const [staff, users] = await Promise.all([
      staffIds.length ? db.staff.findMany({ where: { id: { in: staffIds } }, select: { userId: true } }) : [],
      db.user.findMany({
        where: {
          deletedAt: null,
          status: 'ACTIVE',
          roles: { some: { role: { key: { in: [ROLE.PRINCIPAL, ROLE.LAB_ASSISTANT] } } } },
        },
        select: { id: true },
      }),
    ])
    const userIds = [...staff.map((s) => s.userId), ...users.map((u) => u.id)].filter((x): x is string => !!x)
    if (userIds.length === 0) continue

    const lines = alerts.slice(0, 6).map((a) => `• ${a.text}`)
    if (alerts.length > 6) lines.push(`…and ${alerts.length - 6} more`)
    await notifyTenant(tenantId, {
      userIds,
      eventKey: EVENT_KEY,
      title: `Science lab: ${alerts.length} item(s) need attention`,
      body: lines.join('\n'),
      linkUrl: '/labs',
    })
    schools++
    notified += new Set(userIds).size
  }
  return { schools, notified }
}
