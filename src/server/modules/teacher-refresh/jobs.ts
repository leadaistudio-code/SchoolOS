import type { AppContext } from '@/server/context'
import type { SessionUser } from '@/server/auth/session'
import type { ResolvedTenant } from '@/server/tenant'
import { TeacherRefreshType } from '@prisma/client'
import { prisma } from '@/server/db/prisma'
import { tenantDb } from '@/server/db/tenant-client'
import { notify } from '@/server/notifications'
import { audit } from '@/server/audit'
import { composeRefresher } from './generate'
import { resolveConfig, type ResolvedRefreshConfig } from './service'
import { periodDaysFor, periodStart } from './period'

/**
 * Scheduled automation for knowledge refreshers.
 *
 * There is no job runner in this codebase, so these functions are written to be
 * driven by *any* external trigger — the HTTP endpoint at /api/cron, the
 * `jobs:refresh` script, a platform scheduler — and to be safe to fire more
 * often than needed:
 *
 *   - Tenant-aware: every tenant is processed in its own scoped client, inside
 *     its own try/catch, so one school's bad data cannot stall the rest.
 *   - Idempotent: generation is guarded by a per-teacher, per-subject period
 *     window, so re-running within the same week (or month) creates nothing new.
 *   - Timezone-aware: the period window is computed against each school's own
 *     timezone, so "this week" means the school's week, not the server's.
 *   - Retry-safe: a failure mid-run leaves already-created refreshers in place;
 *     the next run simply skips them and picks up where it left off.
 *   - Cheap: automated generation never spends AI (`allowAi: false`). It draws
 *     only on the approved question bank and skips a subject with no questions
 *     rather than failing — the same path that doubles as the AI-outage fallback.
 */

export type RefreshJobKind = 'weekly' | 'monthly' | 'reminders' | 'overdue' | 'all'

export type RefreshJobReport = {
  kind: RefreshJobKind
  tenantsProcessed: number
  created: number
  reminded: number
  markedOverdue: number
  skippedTenants: number
  errors: { tenantId: string; error: string }[]
}

/** Entry point for the endpoint and the script. Dispatches by kind. */
export async function runTeacherRefreshJobs(kind: RefreshJobKind = 'all'): Promise<RefreshJobReport> {
  const report: RefreshJobReport = {
    kind,
    tenantsProcessed: 0,
    created: 0,
    reminded: 0,
    markedOverdue: 0,
    skippedTenants: 0,
    errors: [],
  }

  const tenants = await prisma.tenant.findMany({
    where: { status: { in: ['ACTIVE', 'TRIAL', 'PAST_DUE'] }, archivedAt: null },
    select: { id: true, name: true, slug: true, status: true, timezone: true, currency: true, locale: true },
  })

  const now = new Date()

  for (const tenant of tenants) {
    const ctx = systemContext(tenant)
    try {
      const config = await resolveConfig(ctx)
      if (!config.enabled) {
        report.skippedTenants += 1
        continue
      }
      report.tenantsProcessed += 1

      if (kind === 'weekly' || kind === 'all') {
        report.created += await generatePeriodic(ctx, config, now)
      }
      if (kind === 'monthly' || kind === 'all') {
        report.created += await generateMonthlyReviews(ctx, config, now)
      }
      if (kind === 'overdue' || kind === 'all') {
        report.markedOverdue += await markOverdue(ctx, now)
      }
      if (kind === 'reminders' || kind === 'all') {
        report.reminded += await sendReminders(ctx, now)
      }
    } catch (err) {
      report.errors.push({ tenantId: tenant.id, error: err instanceof Error ? err.message : String(err) })
    }
  }

  return report
}

/* -------------------------------------------------------------------------- */
/* Generation                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The regular refresh, at the cadence the school configured. One refresher per
 * teacher per subject they teach, per period.
 */
async function generatePeriodic(ctx: AppContext, config: ResolvedRefreshConfig, now: Date): Promise<number> {
  const periodDays = periodDaysFor(config.frequency)
  const since = periodStart(now, periodDays, ctx.tenant.timezone)
  return generateForType(ctx, {
    type: TeacherRefreshType.WEEKLY,
    count: config.weeklyQuestionCount,
    since,
    completionWindowHours: config.completionWindowHours,
    now,
  })
}

/** The deeper monthly subject review — more questions, once a month. */
async function generateMonthlyReviews(ctx: AppContext, config: ResolvedRefreshConfig, now: Date): Promise<number> {
  const since = periodStart(now, 30, ctx.tenant.timezone)
  return generateForType(ctx, {
    type: TeacherRefreshType.MONTHLY,
    count: config.monthlyQuestionCount,
    since,
    completionWindowHours: config.completionWindowHours,
    now,
  })
}

async function generateForType(
  ctx: AppContext,
  opts: {
    type: TeacherRefreshType
    count: number
    since: Date
    completionWindowHours: number
    now: Date
  },
): Promise<number> {
  // Every subject that has a teacher assigned. A teacher is only ever refreshed
  // on subjects they actually take — the assignment is the source of truth.
  const classSubjects = await ctx.db.classSubject.findMany({
    where: { teacherId: { not: null } },
    select: { id: true, teacherId: true },
    take: 5000,
  })

  const createdForTeacher = new Map<string, number>()

  for (const cs of classSubjects) {
    if (!cs.teacherId) continue

    // Idempotency: skip if this teacher already has a refresher of this type for
    // this subject inside the current period.
    const existing = await ctx.db.teacherRefreshAssessment.findFirst({
      where: {
        teacherId: cs.teacherId,
        classSubjectId: cs.id,
        type: opts.type,
        scheduledAt: { gte: opts.since },
      },
      select: { id: true },
    })
    if (existing) continue

    const result = await composeRefresher(ctx, {
      teacherId: cs.teacherId,
      classSubjectId: cs.id,
      type: opts.type,
      count: opts.count,
      completionWindowHours: opts.completionWindowHours,
      allowAi: false,
      trustedScope: true,
    }).catch((err) => {
      console.error('[teacher-refresh] scheduled compose failed', { classSubjectId: cs.id, err })
      return null
    })

    if (result) {
      createdForTeacher.set(cs.teacherId, (createdForTeacher.get(cs.teacherId) ?? 0) + 1)
    }
  }

  const created = [...createdForTeacher.values()].reduce((s, n) => s + n, 0)
  if (created === 0) return 0

  await notifyTeachersAssigned(ctx, createdForTeacher, opts.type)

  await audit({
    tenantId: ctx.tenant.id,
    actorLabel: 'System (scheduled)',
    action: 'teacher_refresh.generate',
    module: 'teacher_refresh',
    summary: `Generated ${created} ${opts.type.toLowerCase()} refresher(s) across ${createdForTeacher.size} teacher(s)`,
  })

  return created
}

/* -------------------------------------------------------------------------- */
/* Reminders and overdue                                                      */
/* -------------------------------------------------------------------------- */

/** Flips still-pending refreshers whose window has closed to OVERDUE. */
async function markOverdue(ctx: AppContext, now: Date): Promise<number> {
  const result = await ctx.db.teacherRefreshAssessment.updateMany({
    where: { status: 'PENDING', dueAt: { lt: now } },
    data: { status: 'OVERDUE' },
  })
  return result.count
}

/**
 * Nudges teachers whose refreshers fall due in the next 24 hours. Designed to
 * run once daily; a second run the same day would re-notify, which is why the
 * trigger, not this function, owns the once-a-day cadence.
 */
async function sendReminders(ctx: AppContext, now: Date): Promise<number> {
  const soon = new Date(now.getTime() + 24 * 60 * 60 * 1000)

  const dueSoon = await ctx.db.teacherRefreshAssessment.findMany({
    where: { status: 'PENDING', dueAt: { gte: now, lt: soon } },
    select: { id: true, teacherId: true },
    take: 5000,
  })
  if (dueSoon.length === 0) return 0

  // Count outstanding per teacher, then send one friendly nudge each.
  const countByTeacher = new Map<string, number>()
  for (const a of dueSoon) {
    countByTeacher.set(a.teacherId, (countByTeacher.get(a.teacherId) ?? 0) + 1)
  }

  const userByTeacher = await teacherUserIds(ctx, [...countByTeacher.keys()])

  let reminded = 0
  for (const [teacherId, count] of countByTeacher) {
    const userId = userByTeacher.get(teacherId)
    if (!userId) continue
    await notify(ctx, {
      userIds: [userId],
      eventKey: 'teacher_refresh.reminder',
      title: 'A knowledge refresher is due soon',
      body:
        count > 1
          ? `You have ${count} refreshers due in the next day. They only take a few minutes each.`
          : 'You have a refresher due in the next day — it only takes a few minutes.',
      linkUrl: '/teacher/refresh',
    })
    reminded += 1
  }

  return reminded
}

async function notifyTeachersAssigned(
  ctx: AppContext,
  createdForTeacher: Map<string, number>,
  type: TeacherRefreshType,
): Promise<void> {
  const userByTeacher = await teacherUserIds(ctx, [...createdForTeacher.keys()])
  const label = type === TeacherRefreshType.MONTHLY ? 'monthly subject review' : 'knowledge refresh'

  for (const [teacherId, count] of createdForTeacher) {
    const userId = userByTeacher.get(teacherId)
    if (!userId) continue
    await notify(ctx, {
      userIds: [userId],
      eventKey: 'teacher_refresh.assigned',
      title: 'A new knowledge refresher is ready',
      body:
        count > 1
          ? `${count} new ${label}s are ready for you — a quick way to keep your teaching sharp.`
          : `A new ${label} is ready for you — a quick way to keep your teaching sharp.`,
      linkUrl: '/teacher/refresh',
    })
  }
}

/** Maps Staff ids to their linked User ids, for notifications. */
async function teacherUserIds(ctx: AppContext, staffIds: string[]): Promise<Map<string, string>> {
  if (staffIds.length === 0) return new Map()
  const staff = await ctx.db.staff.findMany({
    where: { id: { in: staffIds }, userId: { not: null } },
    select: { id: true, userId: true },
  })
  const map = new Map<string, string>()
  for (const s of staff) if (s.userId) map.set(s.id, s.userId)
  return map
}

/* -------------------------------------------------------------------------- */
/* System context                                                             */
/* -------------------------------------------------------------------------- */

const SYSTEM_PERMISSIONS = new Set<string>([
  'teacher_refresh.view_self',
  'teacher_refresh.take',
  'teacher_refresh.manage',
  'teacher_refresh.configure',
])

/**
 * A tenant-bound context for unattended work. It carries a synthetic system
 * "user" holding only the refresh permissions the jobs need, and the tenant's
 * scoped client. It is never reachable from a request; nothing here trusts the
 * network. The `userId` is a sentinel — the automated path never spends AI and
 * so never writes it as a foreign key.
 */
function systemContext(tenant: {
  id: string
  name: string
  slug: string
  status: string
  timezone: string
  currency: string
  locale: string
}): AppContext {
  const user = {
    sessionId: 'system',
    userId: 'system',
    tenantId: tenant.id,
    isSuperAdmin: false,
    firstName: 'System',
    lastName: '',
    email: null,
    phone: null,
    avatarUrl: null,
    mustChangePassword: false,
    roleKeys: [],
    permissions: SYSTEM_PERMISSIONS,
    impersonatedById: null,
  } satisfies SessionUser

  // Jobs read only id and timezone from the tenant; the rest of ResolvedTenant
  // (the school branding block) is never touched on this path.
  const resolvedTenant = {
    id: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    status: tenant.status,
    timezone: tenant.timezone,
    currency: tenant.currency,
    locale: tenant.locale,
  } as unknown as ResolvedTenant

  const can = (permission: string) => user.permissions.has(permission)

  return {
    user,
    tenant: resolvedTenant,
    db: tenantDb(tenant.id),
    can,
    canAny: (...perms: string[]) => perms.some(can),
    require: (permission: string) => {
      if (!can(permission)) throw new Error(`System context missing permission: ${permission}`)
    },
  }
}
