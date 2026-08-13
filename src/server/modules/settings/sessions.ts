import { z } from 'zod'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { conflict, notFound } from '@/server/api/response'
import { attendanceDate } from '@/lib/dates'

export const sessionSchema = z
  .object({
    name: z.string().trim().min(2, 'Name the session, e.g. 2026-27').max(40),
    startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date'),
    endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date'),
    makeCurrent: z.coerce.boolean().default(false),
  })
  .refine((v) => v.endsOn > v.startsOn, {
    path: ['endsOn'],
    message: 'The session must end after it starts',
  })

/**
 * Academic sessions.
 *
 * Everything dated in the product hangs off one of these — classes, exams,
 * fee structures and enrolments are all scoped to a session, and exactly one
 * is current at a time. That invariant is enforced here rather than trusted
 * to the caller, because two current sessions would make "this year's
 * students" an unanswerable question.
 */
export async function listSessions(ctx: AppContext) {
  ctx.require('academics.view')
  return ctx.db.academicSession.findMany({
    orderBy: { startsOn: 'desc' },
    select: {
      id: true,
      name: true,
      startsOn: true,
      endsOn: true,
      isCurrent: true,
      isLocked: true,
      createdAt: true,
      _count: { select: { classes: true, enrollments: true, exams: true, feeStructures: true } },
    },
  })
}

export async function createSession(ctx: AppContext, input: z.infer<typeof sessionSchema>) {
  ctx.require('academics.manage')

  const existing = await ctx.db.academicSession.findFirst({ where: { name: input.name } })
  if (existing) throw conflict(`A session called ${input.name} already exists`)

  // Overlapping sessions would put a date in two years at once, and every
  // "which session is this?" lookup would then depend on which row was read
  // first.
  const startsOn = attendanceDate(input.startsOn)
  const endsOn = attendanceDate(input.endsOn)
  const overlap = await ctx.db.academicSession.findFirst({
    where: { startsOn: { lte: endsOn }, endsOn: { gte: startsOn } },
    select: { name: true },
  })
  if (overlap) throw conflict(`Those dates overlap ${overlap.name}`)

  const first = (await ctx.db.academicSession.count()) === 0
  const shouldBeCurrent = input.makeCurrent || first

  const created = await ctx.db.$transaction(async (tx) => {
    if (shouldBeCurrent) {
      await tx.academicSession.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } })
    }
    return tx.academicSession.create({
      data: {
        tenantId: ctx.tenant.id,
        name: input.name,
        startsOn,
        endsOn,
        isCurrent: shouldBeCurrent,
      },
    })
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'session.create',
    module: 'settings',
    entityType: 'AcademicSession',
    entityId: created.id,
    summary: `Created academic session ${created.name}`,
    after: created,
  })
  return created
}

/**
 * Switches which session the product treats as now.
 *
 * A locked session can still be made current — locking guards against edits
 * to its records, not against looking at it — but the two together are worth
 * warning about on screen.
 */
export async function setCurrentSession(ctx: AppContext, id: string) {
  ctx.require('academics.manage')

  const session = await ctx.db.academicSession.findFirst({ where: { id } })
  if (!session) throw notFound('Academic session')
  if (session.isCurrent) return session

  const updated = await ctx.db.$transaction(async (tx) => {
    await tx.academicSession.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } })
    return tx.academicSession.update({ where: { id }, data: { isCurrent: true } })
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'session.set_current',
    module: 'settings',
    entityType: 'AcademicSession',
    entityId: id,
    summary: `Made ${updated.name} the current session`,
    before: session,
    after: updated,
  })
  return updated
}

/** Locks or unlocks a session. The current session may not be locked. */
export async function setSessionLock(ctx: AppContext, id: string, isLocked: boolean) {
  ctx.require('academics.manage')

  const session = await ctx.db.academicSession.findFirst({ where: { id } })
  if (!session) throw notFound('Academic session')
  if (isLocked && session.isCurrent) {
    throw conflict('The current session cannot be locked — switch to another session first')
  }

  const updated = await ctx.db.academicSession.update({ where: { id }, data: { isLocked } })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: isLocked ? 'session.lock' : 'session.unlock',
    module: 'settings',
    entityType: 'AcademicSession',
    entityId: id,
    summary: `${isLocked ? 'Locked' : 'Unlocked'} ${updated.name}`,
    before: session,
    after: updated,
  })
  return updated
}
