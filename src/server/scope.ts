import { cache } from 'react'
import type { AppContext } from '@/server/context'
import { ROLE } from '@/lib/rbac/roles'

export type ScopedStudent = {
  id: string
  admissionNo: string
  firstName: string
  lastName: string
  photoUrl: string | null
  className: string | null
  sectionName: string | null
  rollNumber: number | null
}

/**
 * Row-level scoping.
 *
 * `students.view` says a role may look at student records; it does not say
 * WHICH ones. A parent holds that permission and must still see only their own
 * children. Every query that can be reached by a self-scoped role runs its
 * student filter through here rather than trusting the permission alone.
 */
export const accessibleStudentIds = cache(
  async (ctx: AppContext): Promise<string[] | null> => {
    const roles = ctx.user.roleKeys

    // Staff roles see the whole school; null means "no row restriction".
    const selfOnly = roles.every(
      (r) => r === ROLE.PARENT || r === ROLE.STUDENT,
    )
    if (!selfOnly) return null

    if (roles.includes(ROLE.PARENT)) {
      const parent = await ctx.db.parent.findFirst({
        where: { userId: ctx.user.userId },
        select: { children: { select: { studentId: true } } },
      })
      return parent?.children.map((c) => c.studentId) ?? []
    }

    const student = await ctx.db.student.findFirst({
      where: { userId: ctx.user.userId },
      select: { id: true },
    })
    return student ? [student.id] : []
  },
)

/** Prisma `where` fragment that applies the row restriction, if any. */
export async function studentScopeWhere(ctx: AppContext) {
  const ids = await accessibleStudentIds(ctx)
  return ids === null ? {} : { id: { in: ids } }
}

export async function studentIdScopeWhere(ctx: AppContext) {
  const ids = await accessibleStudentIds(ctx)
  return ids === null ? {} : { studentId: { in: ids } }
}

/**
 * Throws unless the caller may act on this specific student. Used by detail
 * pages and every student-scoped mutation.
 */
export async function assertStudentAccess(ctx: AppContext, studentId: string) {
  const ids = await accessibleStudentIds(ctx)
  if (ids === null) return
  if (!ids.includes(studentId)) {
    const err = new Error('You do not have access to this student')
    ;(err as { status?: number }).status = 403
    throw err
  }
}

/** The children (or self) a portal user can switch between. */
export const scopedStudents = cache(async (ctx: AppContext): Promise<ScopedStudent[]> => {
  const ids = await accessibleStudentIds(ctx)
  if (ids !== null && ids.length === 0) return []

  const students = await ctx.db.student.findMany({
    where: {
      deletedAt: null,
      ...(ids === null ? {} : { id: { in: ids } }),
    },
    select: {
      id: true,
      admissionNo: true,
      firstName: true,
      lastName: true,
      photoUrl: true,
      enrollments: {
        where: { isCurrent: true },
        select: {
          rollNumber: true,
          classLevel: { select: { name: true } },
          section: { select: { name: true } },
        },
        take: 1,
      },
    },
    orderBy: { firstName: 'asc' },
    take: 25,
  })

  return students.map((s) => ({
    id: s.id,
    admissionNo: s.admissionNo,
    firstName: s.firstName,
    lastName: s.lastName,
    photoUrl: s.photoUrl,
    className: s.enrollments[0]?.classLevel.name ?? null,
    sectionName: s.enrollments[0]?.section.name ?? null,
    rollNumber: s.enrollments[0]?.rollNumber ?? null,
  }))
})
