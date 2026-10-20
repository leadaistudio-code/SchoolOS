import type { AppContext } from '@/server/context'
import { ApiException, forbidden } from '@/server/api/response'
import { accessibleStudentIds } from '@/server/scope'
import { rateLimit } from '@/server/rate-limit'
import { localDate } from '@/lib/tapasya/periods'

export async function limitOrThrow(key: string, limit: number, windowSeconds: number): Promise<void> {
  const r = await rateLimit(key, limit, windowSeconds)
  if (!r.ok) throw new ApiException(429, 'RATE_LIMITED', `Too many requests. Try again in ${r.retryAfterSeconds} seconds.`)
}

/**
 * Identity resolution for Tapasya. A student is always found from the session
 * (`Student.userId`), never from a request body, so nobody can act as another
 * student by naming their id.
 */

export type CurrentStudent = { id: string; userId: string; firstName: string; lastName: string }

export async function currentStudent(ctx: AppContext): Promise<CurrentStudent> {
  const student = await ctx.db.student.findFirst({
    where: { userId: ctx.user.userId, deletedAt: null, status: 'ACTIVE' },
    select: { id: true, userId: true, firstName: true, lastName: true },
  })
  if (!student || !student.userId) {
    throw new ApiException(403, 'NOT_A_STUDENT', 'Tapasya study sessions are for student accounts.')
  }
  return { id: student.id, userId: student.userId, firstName: student.firstName, lastName: student.lastName }
}

/** Student ids a signed-in guardian is linked to. Empty for anyone else. */
export async function guardianChildIds(ctx: AppContext): Promise<string[]> {
  const parent = await ctx.db.parent.findFirst({
    where: { userId: ctx.user.userId, deletedAt: null },
    select: { children: { select: { studentId: true } } },
  })
  return parent?.children.map((c) => c.studentId) ?? []
}

export async function assertGuardianOf(ctx: AppContext, studentId: string): Promise<void> {
  const ids = await guardianChildIds(ctx)
  if (!ids.includes(studentId)) throw forbidden('You are not a linked guardian of this student.')
}

/**
 * Students a teacher may see or assign to: their own sections for a teacher,
 * the whole school for leadership. Reuses the ERP's row scope.
 */
export async function teachableStudentIds(ctx: AppContext): Promise<string[] | null> {
  return accessibleStudentIds(ctx)
}

export async function assertTeachable(ctx: AppContext, studentId: string): Promise<void> {
  const ids = await teachableStudentIds(ctx)
  if (ids !== null && !ids.includes(studentId)) throw forbidden('This student is not in your classes.')
}

/** Today's date in the school's timezone, for tasks and frogs. */
export function schoolToday(ctx: AppContext, at = new Date()): string {
  return localDate(at, ctx.tenant.timezone || 'Asia/Kolkata')
}

export function dateOnly(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`)
}

export function isoDate(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null
}
