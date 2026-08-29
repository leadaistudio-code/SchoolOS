import { Prisma } from '@prisma/client'
import type { AppContext } from '@/server/context'
import { attendanceDate } from '@/lib/dates'
import { audit } from '@/server/audit'
import { assertWithinLimit, FEATURE } from '@/server/entitlements'
import { orderByFrom, skipTake, type ListQuery } from '@/lib/query'
import { studentScopeWhere, assertStudentAccess } from '@/server/scope'
import { ApiException, conflict, notFound } from '@/server/api/response'
import { PROFILE_PHOTO_CATEGORY } from '@/lib/student-documents'
import {
  STUDENT_SORT_FIELDS,
  type StudentCreateInput,
  type StudentListFilter,
  type StudentUpdateInput,
} from './schema'

export type StudentListRow = {
  id: string
  admissionNo: string
  firstName: string
  lastName: string
  photoUrl: string | null
  gender: string | null
  status: string
  className: string | null
  sectionName: string | null
  rollNumber: number | null
  guardianName: string | null
  guardianPhone: string | null
  dueMinor: number
}

/**
 * Paginated student list.
 *
 * Everything - search, filtering, sorting, the outstanding-fee figure - happens
 * in the database. The browser receives one page of rows, never the roll.
 */
export async function listStudents(
  ctx: AppContext,
  query: ListQuery,
  filter: StudentListFilter,
): Promise<{ rows: StudentListRow[]; total: number }> {
  const scope = await studentScopeWhere(ctx)

  const where: Prisma.StudentWhereInput = {
    deletedAt: null,
    ...scope,
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.gender ? { gender: filter.gender } : {}),
    ...(filter.classLevelId || filter.sectionId
      ? {
          enrollments: {
            some: {
              isCurrent: true,
              ...(filter.classLevelId ? { classLevelId: filter.classLevelId } : {}),
              ...(filter.sectionId ? { sectionId: filter.sectionId } : {}),
            },
          },
        }
      : {}),
    ...(query.q
      ? {
          OR: [
            { firstName: { contains: query.q, mode: 'insensitive' } },
            { lastName: { contains: query.q, mode: 'insensitive' } },
            { admissionNo: { contains: query.q, mode: 'insensitive' } },
            {
              guardians: {
                some: {
                  parent: {
                    OR: [
                      { firstName: { contains: query.q, mode: 'insensitive' } },
                      { lastName: { contains: query.q, mode: 'insensitive' } },
                      { phone: { contains: query.q } },
                    ],
                  },
                },
              },
            },
          ],
        }
      : {}),
    ...(filter.hasDues === 'yes'
      ? { invoices: { some: { balanceMinor: { gt: 0 }, status: { notIn: ['CANCELLED', 'DRAFT'] } } } }
      : {}),
    ...(filter.hasDues === 'no'
      ? { invoices: { every: { OR: [{ balanceMinor: { lte: 0 } }, { status: { in: ['CANCELLED', 'DRAFT'] } }] } } }
      : {}),
  }

  const orderBy = orderByFrom(query.sort, query.dir, STUDENT_SORT_FIELDS, {
    firstName: 'asc',
  })

  const [rows, total] = await Promise.all([
    ctx.db.student.findMany({
      where,
      orderBy,
      ...skipTake(query),
      select: {
        id: true,
        admissionNo: true,
        firstName: true,
        lastName: true,
        photoUrl: true,
        gender: true,
        status: true,
        enrollments: {
          where: { isCurrent: true },
          take: 1,
          select: {
            rollNumber: true,
            classLevel: { select: { name: true } },
            section: { select: { name: true } },
          },
        },
        guardians: {
          where: { isPrimary: true },
          take: 1,
          select: { parent: { select: { firstName: true, lastName: true, phone: true } } },
        },
        invoices: {
          where: { balanceMinor: { gt: 0 }, status: { notIn: ['CANCELLED', 'DRAFT'] } },
          select: { balanceMinor: true },
        },
      },
    }),
    ctx.db.student.count({ where }),
  ])

  return {
    total,
    rows: rows.map((s) => ({
      id: s.id,
      admissionNo: s.admissionNo,
      firstName: s.firstName,
      lastName: s.lastName,
      photoUrl: s.photoUrl,
      gender: s.gender,
      status: s.status,
      className: s.enrollments[0]?.classLevel.name ?? null,
      sectionName: s.enrollments[0]?.section.name ?? null,
      rollNumber: s.enrollments[0]?.rollNumber ?? null,
      guardianName: s.guardians[0]
        ? `${s.guardians[0].parent.firstName} ${s.guardians[0].parent.lastName}`
        : null,
      guardianPhone: s.guardians[0]?.parent.phone ?? null,
      dueMinor: s.invoices.reduce((sum, i) => sum + i.balanceMinor, 0),
    })),
  }
}

export async function getStudent(ctx: AppContext, id: string) {
  await assertStudentAccess(ctx, id)

  const student = await ctx.db.student.findFirst({
    where: { id, deletedAt: null },
    include: {
      enrollments: {
        orderBy: { joinedOn: 'desc' },
        include: {
          classLevel: { select: { id: true, name: true } },
          section: { select: { id: true, name: true } },
          session: { select: { id: true, name: true } },
        },
      },
      guardians: { include: { parent: true } },
      documents: {
        where: { deletedAt: null, NOT: { category: PROFILE_PHOTO_CATEGORY } },
        orderBy: { createdAt: 'desc' },
      },
      invoices: {
        where: { status: { notIn: ['CANCELLED'] } },
        orderBy: { dueOn: 'desc' },
        take: 20,
      },
      transport: {
        where: { isActive: true },
        include: { route: true, stop: true, bus: true },
      },
    },
  })

  if (!student) throw notFound('Student')
  return student
}

/**
 * Creates a student, their first enrollment and optionally a guardian, in one
 * transaction. Either the whole record exists or none of it does - a student
 * without a class placement is not a valid state.
 */
export async function createStudent(ctx: AppContext, input: StudentCreateInput) {
  ctx.require('students.create')

  const activeCount = await ctx.db.student.count({
    where: { status: 'ACTIVE', deletedAt: null },
  })
  await assertWithinLimit(ctx.tenant.id, FEATURE.LIMIT_STUDENTS, activeCount)

  const session = await ctx.db.academicSession.findFirst({ where: { isCurrent: true } })
  if (!session) {
    throw new ApiException(
      409,
      'NO_ACTIVE_SESSION',
      'No active academic session. Create one in Settings before adding students.',
    )
  }

  const section = await ctx.db.section.findFirst({
    where: { id: input.sectionId, classLevelId: input.classLevelId },
    include: { _count: { select: { enrollments: { where: { isCurrent: true } } } } },
  })
  if (!section) throw new ApiException(400, 'BAD_REQUEST', 'That section does not belong to the selected class')
  if (section._count.enrollments >= section.capacity) {
    throw conflict(`Section ${section.name} is full (capacity ${section.capacity})`)
  }

  const duplicate = await ctx.db.student.findFirst({
    where: { admissionNo: input.admissionNo },
    select: { id: true },
  })
  if (duplicate) throw conflict(`Admission number ${input.admissionNo} is already in use`)

  const created = await ctx.db.$transaction(async (tx) => {
    const student = await tx.student.create({
      data: {
        // The tenant extension stamps this too; naming it keeps the
        // transaction client (which is untyped by the extension) type-safe.
        tenantId: ctx.tenant.id,
        admissionNo: input.admissionNo,
        firstName: input.firstName,
        lastName: input.lastName,
        dateOfBirth: input.dateOfBirth ? attendanceDate(input.dateOfBirth) : null,
        gender: input.gender,
        bloodGroup: input.bloodGroup,
        category: input.category,
        religion: input.religion,
        nationality: input.nationality,
        motherTongue: input.motherTongue,
        admissionDate: input.admissionDate
          ? attendanceDate(input.admissionDate)
          : attendanceDate(new Date()),
        previousSchool: input.previousSchool,
        addressLine1: input.addressLine1,
        addressLine2: input.addressLine2,
        city: input.city,
        state: input.state,
        postalCode: input.postalCode,
        emergencyContactName: input.emergencyContactName,
        emergencyContactPhone: input.emergencyContactPhone,
        medicalNotes: input.medicalNotes,
        allergies: input.allergies,
      },
    })

    await tx.enrollment.create({
      data: {
        tenantId: ctx.tenant.id,
        studentId: student.id,
        sessionId: session.id,
        classLevelId: input.classLevelId,
        sectionId: input.sectionId,
        rollNumber: input.rollNumber ?? null,
        isCurrent: true,
      },
    })

    if (input.guardian) {
      const { storePhone } = await import('@/server/auth/phone')
      const parent = await tx.parent.create({
        data: {
          tenantId: ctx.tenant.id,
          firstName: input.guardian.firstName,
          lastName: input.guardian.lastName,
          phone: storePhone(input.guardian.phone),
          email: input.guardian.email || null,
          occupation: input.guardian.occupation,
        },
      })
      await tx.studentGuardian.create({
        data: {
          tenantId: ctx.tenant.id,
          studentId: student.id,
          parentId: parent.id,
          relation: input.guardian.relation,
          isPrimary: true,
          isEmergencyContact: true,
        },
      })
    }

    return student
  })

  let temporaryPassword: string | undefined
  if (input.guardian?.createLogin && input.guardian.phone && input.dateOfBirth) {
    const link = await ctx.db.studentGuardian.findFirst({
      where: { studentId: created.id, isPrimary: true },
      select: { parentId: true },
    })
    if (link) {
      try {
        const { issueParentPortalLogin } = await import('@/server/modules/people/service')
        const issued = await issueParentPortalLogin(ctx, link.parentId)
        temporaryPassword = issued.temporaryPassword
      } catch (err) {
        console.error('[students] parent portal login not created', err)
      }
    }
  }

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'student.create',
    module: 'students',
    entityType: 'Student',
    entityId: created.id,
    summary: `Admitted ${created.firstName} ${created.lastName} (${created.admissionNo})`,
    after: created,
  })

  return Object.assign(created, { temporaryPassword }) as typeof created & {
    temporaryPassword?: string
  }
}

export async function updateStudent(
  ctx: AppContext,
  id: string,
  input: StudentUpdateInput,
) {
  ctx.require('students.edit')
  await assertStudentAccess(ctx, id)

  const before = await ctx.db.student.findFirst({ where: { id, deletedAt: null } })
  if (!before) throw notFound('Student')

  if (input.admissionNo && input.admissionNo !== before.admissionNo) {
    const clash = await ctx.db.student.findFirst({
      where: { admissionNo: input.admissionNo, id: { not: id } },
      select: { id: true },
    })
    if (clash) throw conflict(`Admission number ${input.admissionNo} is already in use`)
  }

  const { classLevelId, sectionId, rollNumber, ...fields } = input

  if (fields.dateOfBirth) fields.dateOfBirth = attendanceDate(fields.dateOfBirth)
  if (fields.admissionDate) fields.admissionDate = attendanceDate(fields.admissionDate)

  const updated = await ctx.db.$transaction(async (tx) => {
    const student = await tx.student.update({
      where: { id },
      data: fields,
    })

    // A class or section change is a new placement within the same session,
    // not a silent edit of the historical record.
    if (classLevelId && sectionId) {
      const current = await tx.enrollment.findFirst({
        where: { studentId: id, isCurrent: true },
      })
      if (current && (current.classLevelId !== classLevelId || current.sectionId !== sectionId)) {
        await tx.enrollment.update({
          where: { id: current.id },
          data: { classLevelId, sectionId, rollNumber: rollNumber ?? current.rollNumber },
        })
      } else if (current && rollNumber !== undefined) {
        await tx.enrollment.update({ where: { id: current.id }, data: { rollNumber } })
      }
    }

    return student
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'student.update',
    module: 'students',
    entityType: 'Student',
    entityId: id,
    summary: `Updated ${updated.firstName} ${updated.lastName}`,
    before,
    after: updated,
  })

  return updated
}

/**
 * Archive rather than delete. Attendance, invoices, receipts and results all
 * reference a student; hard deletion would tear holes in financial and
 * academic history that a school is legally required to keep.
 */
export async function archiveStudent(ctx: AppContext, id: string, reason?: string) {
  ctx.require('students.delete')

  const before = await ctx.db.student.findFirst({ where: { id, deletedAt: null } })
  if (!before) throw notFound('Student')

  const outstanding = await ctx.db.feeInvoice.aggregate({
    where: { studentId: id, status: { notIn: ['CANCELLED', 'DRAFT'] }, balanceMinor: { gt: 0 } },
    _sum: { balanceMinor: true },
  })

  const archived = await ctx.db.$transaction(async (tx) => {
    await tx.enrollment.updateMany({
      where: { studentId: id, isCurrent: true },
      data: { isCurrent: false, leftOn: new Date() },
    })
    return tx.student.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'WITHDRAWN' },
    })
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'student.archive',
    module: 'students',
    entityType: 'Student',
    entityId: id,
    summary: `Archived ${before.firstName} ${before.lastName}${
      (outstanding._sum.balanceMinor ?? 0) > 0
        ? ` with outstanding dues of ${(outstanding._sum.balanceMinor ?? 0) / 100}`
        : ''
    }${reason ? ` - ${reason}` : ''}`,
    before,
    after: archived,
  })

  return archived
}

/** Options for the class/section pickers used across the module. */
export async function getClassOptions(ctx: AppContext) {
  const session = await ctx.db.academicSession.findFirst({ where: { isCurrent: true } })
  if (!session) return []

  return ctx.db.classLevel.findMany({
    where: { sessionId: session.id, deletedAt: null },
    orderBy: { numeric: 'asc' },
    select: {
      id: true,
      name: true,
      numeric: true,
      sections: {
        where: { deletedAt: null },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          capacity: true,
          _count: { select: { enrollments: { where: { isCurrent: true } } } },
        },
      },
    },
  })
}
