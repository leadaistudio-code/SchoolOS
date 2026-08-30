import { cache } from 'react'
import { ForbiddenError, type AppContext } from '@/server/context'
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

export function isTeacherOnlyRole(roleKeys: string[]): boolean {
  return roleKeys.length > 0 && roleKeys.every((r) => r === ROLE.TEACHER)
}

export function isPortalOnlyRole(roleKeys: string[]): boolean {
  return (
    roleKeys.length > 0 &&
    roleKeys.every((r) => r === ROLE.PARENT || r === ROLE.STUDENT)
  )
}

/** Staff row for a teacher-only account, or null when the caller is not teacher-only. */
export const teachingStaffId = cache(async (ctx: AppContext): Promise<string | null> => {
  if (!isTeacherOnlyRole(ctx.user.roleKeys)) return null

  const staff = await ctx.db.staff.findFirst({
    where: { userId: ctx.user.userId, deletedAt: null },
    select: { id: true },
  })
  return staff?.id ?? null
})

/** Class levels the teacher is assigned to via subject or as class teacher. */
export const teachingClassLevelIds = cache(
  async (ctx: AppContext): Promise<string[] | null> => {
    const staffId = await teachingStaffId(ctx)
    if (staffId === null) return null
    if (!staffId) return []

    const [fromSubjects, fromClassTeacher] = await Promise.all([
      ctx.db.classSubject.findMany({
        where: { teacherId: staffId },
        select: { classLevelId: true },
      }),
      ctx.db.section.findMany({
        where: { classTeacherId: staffId, deletedAt: null },
        select: { classLevelId: true },
      }),
    ])

    return [
      ...new Set([
        ...fromSubjects.map((r) => r.classLevelId),
        ...fromClassTeacher.map((r) => r.classLevelId),
      ]),
    ]
  },
)

/** Sections a teacher-only user may mark attendance for. */
export const markableSectionIds = cache(async (ctx: AppContext): Promise<string[] | null> => {
  const staffId = await teachingStaffId(ctx)
  if (staffId === null) return null
  if (!staffId) return []

  const session = await ctx.db.academicSession.findFirst({
    where: { isCurrent: true },
    select: { id: true },
  })
  if (!session) return []

  const rows = await ctx.db.section.findMany({
    where: {
      deletedAt: null,
      classLevel: { sessionId: session.id, deletedAt: null },
      OR: [
        { classTeacherId: staffId },
        { classLevel: { subjects: { some: { teacherId: staffId } } } },
      ],
    },
    select: { id: true },
  })
  return rows.map((r) => r.id)
})

async function teachingStudentIds(ctx: AppContext): Promise<string[]> {
  const classLevelIds = await teachingClassLevelIds(ctx)
  if (!classLevelIds || classLevelIds.length === 0) return []

  const staffId = await teachingStaffId(ctx)
  if (!staffId) return []

  const session = await ctx.db.academicSession.findFirst({
    where: { isCurrent: true },
    select: { id: true },
  })
  if (!session) return []

  const ownedSections = await ctx.db.section.findMany({
    where: { classTeacherId: staffId, deletedAt: null },
    select: { id: true },
  })
  const sectionIds = ownedSections.map((s) => s.id)

  const enrollments = await ctx.db.enrollment.findMany({
    where: {
      sessionId: session.id,
      isCurrent: true,
      student: { deletedAt: null, status: 'ACTIVE' },
      OR: [
        { classLevelId: { in: classLevelIds } },
        ...(sectionIds.length > 0 ? [{ sectionId: { in: sectionIds } }] : []),
      ],
    },
    select: { studentId: true },
  })

  return [...new Set(enrollments.map((e) => e.studentId))]
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

    if (isTeacherOnlyRole(roles)) {
      return teachingStudentIds(ctx)
    }

    const selfOnly = isPortalOnlyRole(roles)
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

/**
 * The class-subjects a teacher may act on, or `null` for no restriction.
 *
 * The same shape as `accessibleStudentIds` and for the same reason:
 * `curriculum.manage` says a role may edit a syllabus, not whose. A teacher
 * holds it and must still be confined to the subjects they actually take, which
 * `ClassSubject.teacherId` already records. Coordinators, principals and admins
 * carry other roles alongside, so they fall through unrestricted.
 *
 * Returns an empty array — not `null` — for a teacher with no assigned
 * subjects, so an unassigned account sees nothing rather than everything.
 */
export const teachingClassSubjectIds = cache(
  async (ctx: AppContext): Promise<string[] | null> => {
    const roles = ctx.user.roleKeys
    if (!roles.every((r) => r === ROLE.TEACHER)) return null

    const staff = await ctx.db.staff.findFirst({
      where: { userId: ctx.user.userId },
      select: { id: true },
    })
    if (!staff) return []

    const rows = await ctx.db.classSubject.findMany({
      where: { teacherId: staff.id },
      select: { id: true },
    })
    return rows.map((r) => r.id)
  },
)

/** Throws unless the caller may act on this specific class-subject. */
export async function assertClassSubjectAccess(ctx: AppContext, classSubjectId: string) {
  const ids = await teachingClassSubjectIds(ctx)
  if (ids === null) return
  if (!ids.includes(classSubjectId)) {
    throw new ForbiddenError('You do not teach this subject')
  }
}

/** Throws unless a teacher-only user may mark attendance for this section. */
export async function assertMarkableSection(ctx: AppContext, sectionId: string) {
  const ids = await markableSectionIds(ctx)
  if (ids === null) return
  if (!ids.includes(sectionId)) {
    throw new ForbiddenError('You cannot access attendance for this section')
  }
}

/** Prisma `where` fragment that applies the row restriction, if any. */
export async function studentScopeWhere(ctx: AppContext) {
  const ids = await accessibleStudentIds(ctx)
  return ids === null ? {} : { id: { in: ids } }
}

export async function studentIdScopeWhere(ctx: AppContext) {
  const ids = await accessibleStudentIds(ctx)
  return ids === null ? {} : { studentId: { in: ids } }
}

export async function classLevelScopeWhere(ctx: AppContext) {
  const ids = await teachingClassLevelIds(ctx)
  return ids === null ? {} : { id: { in: ids } }
}

/**
 * Throws unless the caller may act on this specific student. Used by detail
 * pages and every student-scoped mutation.
 */
export async function assertStudentAccess(ctx: AppContext, studentId: string) {
  const ids = await accessibleStudentIds(ctx)
  if (ids === null) return
  if (!ids.includes(studentId)) {
    throw new ForbiddenError('You do not have access to this student')
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
