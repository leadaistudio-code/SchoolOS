import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { conflict, notFound, ApiException } from '@/server/api/response'
import { orderByFrom, skipTake, type ListQuery } from '@/lib/query'
import { assertWithinLimit, FEATURE } from '@/server/entitlements'
import { generateTemporaryPassword, hashPassword } from '@/server/auth/password'
import { parentInitialPassword, staffInitialPassword } from '@/server/auth/initial-password'
import { phoneLookupCandidates, storePhone } from '@/server/auth/phone'
import { ROLE } from '@/lib/rbac/roles'
import {
  setTemporaryPassword,
  TEMP_PASSWORD_TTL_HOURS,
} from '@/server/modules/settings/users'

const optional = (max: number) =>
  z.string().trim().max(max).optional().transform((v) => (v === '' ? undefined : v))

const phone = z
  .string()
  .trim()
  .regex(/^[0-9+\-\s()]{7,20}$/, 'Enter a valid phone number')
  .optional()
  .transform((v) => (v === '' ? undefined : v))

const email = z
  .string()
  .trim()
  .email('Enter a valid email address')
  .optional()
  .or(z.literal(''))
  .transform((v) => (v === '' ? undefined : v))

/* ------------------------------------------------------------------ parents */

export const parentCreateSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(60),
  lastName: z.string().trim().max(60).default(''),
  phone,
  email,
  occupation: optional(80),
  annualIncome: optional(40),
  addressLine1: optional(160),
  city: optional(80),
  state: optional(80),
  postalCode: optional(12),
  /** Creates a portal login and returns a one-time password to hand over. */
  createLogin: z.coerce.boolean().default(false),
})

export const parentUpdateSchema = parentCreateSchema.partial().omit({ createLogin: true })

export const linkChildSchema = z.object({
  studentId: z.string().min(1, 'Select a student'),
  relation: z.enum(['FATHER', 'MOTHER', 'GUARDIAN', 'OTHER']).default('GUARDIAN'),
  isPrimary: z.coerce.boolean().default(false),
})

export const PARENT_SORT_FIELDS = ['firstName', 'lastName', 'createdAt'] as const

export type ParentRow = {
  id: string
  userId: string | null
  firstName: string
  lastName: string
  phone: string | null
  email: string | null
  occupation: string | null
  hasLogin: boolean
  childCount: number
  children: string[]
}

export async function listParents(
  ctx: AppContext,
  query: ListQuery,
): Promise<{ rows: ParentRow[]; total: number }> {
  ctx.require('parents.view')

  const where: Prisma.ParentWhereInput = {
    deletedAt: null,
    ...(query.q
      ? {
          OR: [
            { firstName: { contains: query.q, mode: 'insensitive' } },
            { lastName: { contains: query.q, mode: 'insensitive' } },
            { phone: { contains: query.q } },
            { email: { contains: query.q, mode: 'insensitive' } },
            {
              children: {
                some: {
                  student: {
                    OR: [
                      { firstName: { contains: query.q, mode: 'insensitive' } },
                      { lastName: { contains: query.q, mode: 'insensitive' } },
                      { admissionNo: { contains: query.q, mode: 'insensitive' } },
                    ],
                  },
                },
              },
            },
          ],
        }
      : {}),
  }

  const orderBy = orderByFrom(query.sort, query.dir, PARENT_SORT_FIELDS, { firstName: 'asc' })

  const [rows, total] = await Promise.all([
    ctx.db.parent.findMany({
      where,
      orderBy,
      ...skipTake(query),
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
        occupation: true,
        userId: true,
        children: {
          select: {
            student: { select: { firstName: true, lastName: true, admissionNo: true } },
          },
        },
      },
    }),
    ctx.db.parent.count({ where }),
  ])

  return {
    total,
    rows: rows.map((p) => ({
      id: p.id,
      userId: p.userId,
      firstName: p.firstName,
      lastName: p.lastName,
      phone: p.phone,
      email: p.email,
      occupation: p.occupation,
      hasLogin: !!p.userId,
      childCount: p.children.length,
      children: p.children.map((c) => `${c.student.firstName} ${c.student.lastName}`),
    })),
  }
}

export async function getParent(ctx: AppContext, id: string) {
  ctx.require('parents.view')

  const parent = await ctx.db.parent.findFirst({
    where: { id, deletedAt: null },
    include: {
      user: { select: { id: true, email: true, status: true, lastLoginAt: true } },
      children: {
        include: {
          student: {
            select: {
              id: true,
              photoUrl: true,
              firstName: true,
              lastName: true,
              admissionNo: true,
              dateOfBirth: true,
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
            },
          },
        },
      },
    },
  })
  if (!parent) throw notFound('Parent')
  return parent
}

/**
 * Creates a parent, optionally with a portal login.
 *
 * Portal logins need a linked child (for the first-name + DOB password). When
 * `createLogin` is set at create time with no children yet, the account is not
 * created here — call `issueParentPortalLogin` after linking a student.
 *
 * The generated password is returned exactly once, to be handed over out of
 * band, and the account is flagged `mustChangePassword` so the school never
 * knows the parent's working password.
 */
export async function createParent(
  ctx: AppContext,
  input: z.infer<typeof parentCreateSchema>,
  opts?: { passwordStudentId?: string },
): Promise<{ parent: { id: string }; temporaryPassword?: string }> {
  ctx.require('parents.create')

  const phone = storePhone(input.phone)
  const email = input.email?.trim().toLowerCase() || undefined

  if (email) {
    const clash = await ctx.db.parent.findFirst({
      where: { email, deletedAt: null },
      select: { id: true },
    })
    if (clash) throw conflict(`A parent with the email ${email} already exists`)
  }

  if (phone) {
    const clash = await ctx.db.parent.findFirst({
      where: { phone: { in: phoneLookupCandidates(phone) }, deletedAt: null },
      select: { id: true },
    })
    if (clash) throw conflict(`A parent with this phone number already exists`)
  }

  const parent = await ctx.db.parent.create({
    data: {
      tenantId: ctx.tenant.id,
      firstName: input.firstName,
      lastName: input.lastName,
      phone,
      email: email ?? null,
      occupation: input.occupation,
      annualIncome: input.annualIncome,
      addressLine1: input.addressLine1,
      city: input.city,
      state: input.state,
      postalCode: input.postalCode,
    },
  })

  let temporaryPassword: string | undefined
  if (input.createLogin) {
    if (!opts?.passwordStudentId) {
      throw new ApiException(
        400,
        'BAD_REQUEST',
        'Link a child with a date of birth before creating a parent portal login',
      )
    }
    await ctx.db.studentGuardian.create({
      data: {
        tenantId: ctx.tenant.id,
        parentId: parent.id,
        studentId: opts.passwordStudentId,
        relation: 'GUARDIAN',
        isPrimary: true,
        isEmergencyContact: true,
      },
    })
    const issued = await issueParentPortalLogin(ctx, parent.id)
    temporaryPassword = issued.temporaryPassword
  }

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'parent.create',
    module: 'parents',
    entityType: 'Parent',
    entityId: parent.id,
    summary: `Added parent ${parent.firstName} ${parent.lastName}${temporaryPassword ? ' with a portal login' : ''}`,
    after: parent,
  })

  return { parent, temporaryPassword }
}

/**
 * Issues (or re-issues) a parent portal login.
 *
 * Username = phone. Password = childFirstName + YYYYMMDD from the primary
 * linked student (else earliest link). Does not overwrite an account that
 * already exists unless `reset: true`.
 */
export async function issueParentPortalLogin(
  ctx: AppContext,
  parentId: string,
  opts?: { reset?: boolean },
): Promise<{ temporaryPassword: string; userId: string }> {
  if (!ctx.can('users.create') && !ctx.can('parents.create') && !ctx.can('parents.edit')) {
    ctx.require('users.create')
  }

  const parent = await ctx.db.parent.findFirst({
    where: { id: parentId, deletedAt: null },
    include: {
      children: {
        orderBy: [{ isPrimary: 'desc' }],
        include: {
          student: {
            select: { firstName: true, dateOfBirth: true, deletedAt: true, admissionNo: true },
          },
        },
      },
    },
  })
  if (!parent) throw notFound('Parent')

  const phone = storePhone(parent.phone)
  if (!phone) {
    throw new ApiException(
      400,
      'BAD_REQUEST',
      'A phone number is needed to create a parent portal login',
    )
  }

  // Prefer the primary-linked child that has a DOB; otherwise any linked child with DOB.
  const child = parent.children
    .map((c) => c.student)
    .find((s) => s && !s.deletedAt && s.dateOfBirth)
  if (!child?.dateOfBirth) {
    throw new ApiException(
      400,
      'BAD_REQUEST',
      'Add a date of birth on the linked student before creating a parent portal login. The first password is child first name + DOB (YYYYMMDD).',
    )
  }

  let temporaryPassword: string
  try {
    temporaryPassword = parentInitialPassword(child.firstName, child.dateOfBirth)
  } catch (err) {
    throw new ApiException(
      400,
      'BAD_REQUEST',
      err instanceof Error ? err.message : 'Could not build the parent password',
    )
  }

  if (parent.userId && !opts?.reset) {
    throw conflict('This parent already has a portal login')
  }

  await assertPhoneAvailable(ctx, phone, parent.userId ?? undefined)

  const role = await ctx.db.role.findFirst({
    where: { key: ROLE.PARENT, OR: [{ tenantId: null }, { tenantId: ctx.tenant.id }] },
  })
  const passwordHash = await hashPassword(temporaryPassword)

  let userId = parent.userId
  if (userId) {
    await ctx.db.user.update({
      where: { id: userId },
      data: {
        phone,
        passwordHash,
        mustChangePassword: true,
        tempPasswordExpiresAt: null,
        status: 'ACTIVE',
        failedLoginCount: 0,
        lockedUntil: null,
      },
    })
  } else {
    const user = await ctx.db.user.create({
      data: {
        tenantId: ctx.tenant.id,
        email: parent.email?.trim().toLowerCase() || null,
        phone,
        passwordHash,
        firstName: parent.firstName,
        lastName: parent.lastName,
        mustChangePassword: true,
        ...(role ? { roles: { create: { roleId: role.id } } } : {}),
      },
    })
    userId = user.id
    await ctx.db.parent.update({ where: { id: parentId }, data: { userId, phone } })
  }

  if (parent.phone !== phone) {
    await ctx.db.parent.update({ where: { id: parentId }, data: { phone } })
  }

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'parent.issue_login',
    module: 'parents',
    entityType: 'Parent',
    entityId: parentId,
    summary: `Issued portal login for ${parent.firstName} ${parent.lastName}`,
  })

  return { temporaryPassword, userId }
}

async function assertPhoneAvailable(ctx: AppContext, phone: string, exceptUserId?: string) {
  const clash = await ctx.db.user.findFirst({
    where: {
      tenantId: ctx.tenant.id,
      deletedAt: null,
      phone: { in: phoneLookupCandidates(phone) },
      ...(exceptUserId ? { id: { not: exceptUserId } } : {}),
    },
    select: { id: true },
  })
  if (clash) throw conflict('Another account already uses this phone number')
}

export type ParentProfileUpdate = {
  firstName?: string
  lastName?: string
  phone?: string | null
  email?: string | null
  occupation?: string | null
  annualIncome?: string | null
  addressLine1?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
}

export async function updateParent(ctx: AppContext, id: string, input: ParentProfileUpdate) {
  ctx.require('parents.edit')

  const before = await ctx.db.parent.findFirst({ where: { id, deletedAt: null } })
  if (!before) throw notFound('Parent')

  const phone =
    input.phone !== undefined ? storePhone(input.phone ?? undefined) ?? null : undefined
  const email =
    input.email !== undefined
      ? input.email?.trim().toLowerCase() || null
      : undefined

  if (email) {
    const clash = await ctx.db.parent.findFirst({
      where: { email, deletedAt: null, id: { not: id } },
      select: { id: true },
    })
    if (clash) throw conflict(`A parent with the email ${email} already exists`)
  }

  if (phone) {
    const clash = await ctx.db.parent.findFirst({
      where: {
        phone: { in: phoneLookupCandidates(phone) },
        deletedAt: null,
        id: { not: id },
      },
      select: { id: true },
    })
    if (clash) throw conflict('A parent with this phone number already exists')
    if (before.userId) await assertPhoneAvailable(ctx, phone, before.userId)
  }

  const data: Prisma.ParentUpdateInput = {
    ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
    ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
    ...(phone !== undefined ? { phone } : {}),
    ...(email !== undefined ? { email } : {}),
    ...(input.occupation !== undefined ? { occupation: input.occupation || null } : {}),
    ...(input.annualIncome !== undefined ? { annualIncome: input.annualIncome || null } : {}),
    ...(input.addressLine1 !== undefined ? { addressLine1: input.addressLine1 || null } : {}),
    ...(input.city !== undefined ? { city: input.city || null } : {}),
    ...(input.state !== undefined ? { state: input.state || null } : {}),
    ...(input.postalCode !== undefined ? { postalCode: input.postalCode || null } : {}),
  }

  const updated = await ctx.db.parent.update({ where: { id }, data })

  if (before.userId) {
    await ctx.db.user.update({
      where: { id: before.userId },
      data: {
        ...(input.firstName !== undefined ? { firstName: updated.firstName } : {}),
        ...(input.lastName !== undefined ? { lastName: updated.lastName } : {}),
        ...(phone !== undefined ? { phone } : {}),
        ...(email !== undefined ? { email } : {}),
      },
    })
  }

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'parent.update',
    module: 'parents',
    entityType: 'Parent',
    entityId: id,
    summary: `Updated parent ${updated.firstName} ${updated.lastName}`,
    before,
    after: updated,
  })
  return updated
}

/** Links an existing student to this parent. */
export async function linkChild(
  ctx: AppContext,
  parentId: string,
  input: z.infer<typeof linkChildSchema>,
) {
  ctx.require('parents.edit')

  const [parent, student] = await Promise.all([
    ctx.db.parent.findFirst({ where: { id: parentId, deletedAt: null } }),
    ctx.db.student.findFirst({ where: { id: input.studentId, deletedAt: null } }),
  ])
  if (!parent) throw notFound('Parent')
  if (!student) throw notFound('Student')

  const existing = await ctx.db.studentGuardian.findFirst({
    where: { parentId, studentId: input.studentId },
  })
  if (existing) throw conflict('This student is already linked to this parent')

  if (input.isPrimary) {
    await ctx.db.studentGuardian.updateMany({
      where: { studentId: input.studentId, isPrimary: true },
      data: { isPrimary: false },
    })
  }

  const link = await ctx.db.studentGuardian.create({
    data: {
      tenantId: ctx.tenant.id,
      parentId,
      studentId: input.studentId,
      relation: input.relation,
      isPrimary: input.isPrimary,
    },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'parent.link_child',
    module: 'parents',
    entityType: 'Parent',
    entityId: parentId,
    summary: `Linked ${student.firstName} ${student.lastName} to ${parent.firstName} ${parent.lastName} as ${input.relation.toLowerCase()}`,
    after: link,
  })
  return link
}

/**
 * Unlinks a child. Refuses to remove the last guardian: a student with no
 * guardian has nobody to receive fee notices or absence alerts.
 */
export async function unlinkChild(ctx: AppContext, parentId: string, studentId: string) {
  ctx.require('parents.edit')

  const remaining = await ctx.db.studentGuardian.count({ where: { studentId } })
  if (remaining <= 1) {
    throw conflict(
      'This is the only guardian linked to the student. Link another guardian before removing this one.',
    )
  }

  const link = await ctx.db.studentGuardian.findFirst({ where: { parentId, studentId } })
  if (!link) throw notFound('Link')

  await ctx.db.studentGuardian.delete({ where: { id: link.id } })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'parent.unlink_child',
    module: 'parents',
    entityType: 'Parent',
    entityId: parentId,
    summary: 'Unlinked a child from this parent',
    before: link,
  })
  return { ok: true }
}

/* -------------------------------------------------------------------- staff */

export const staffBaseSchema = z.object({
  employeeCode: z
    .string()
    .trim()
    .min(1, 'Employee code is required')
    .max(30)
    .regex(/^[A-Za-z0-9/_-]+$/, 'Use letters, numbers, dash, slash or underscore only'),
  firstName: z.string().trim().min(1, 'First name is required').max(60),
  lastName: z.string().trim().min(1, 'Last name is required').max(60),
  staffType: z
    .enum(['TEACHING', 'ADMIN', 'SUPPORT', 'DRIVER', 'LIBRARIAN', 'ACCOUNTANT', 'OTHER'])
    .default('TEACHING'),
  designation: optional(80),
  department: optional(80),
  qualification: optional(120),
  experienceYears: z.coerce.number().min(0).max(60).optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  dateOfBirth: z.coerce.date().optional(),
  phone,
  email,
  joinedOn: z.coerce.date().optional(),
  salaryMinor: z.coerce.number().int().min(0).optional(),
  addressLine1: optional(160),
  city: optional(80),
  state: optional(80),
  postalCode: optional(12),
  /** Guest / part-time: use personal check-in and check-out hours instead of school day. */
  customAttendanceHours: z.coerce.boolean().default(false),
  attendanceStartMinutes: z.coerce.number().int().min(0).max(24 * 60 - 1).nullable().optional(),
  attendanceEndMinutes: z.coerce.number().int().min(0).max(24 * 60 - 1).nullable().optional(),
  attendanceLateAfterMinutes: z.coerce.number().int().min(0).max(24 * 60 - 1).nullable().optional(),
})

function refineCustomAttendanceHours<
  T extends {
    customAttendanceHours?: boolean
    attendanceStartMinutes?: number | null
    attendanceEndMinutes?: number | null
  },
>(value: T, context: z.RefinementCtx) {
  if (!value.customAttendanceHours) return
  if (value.attendanceStartMinutes == null) {
    context.addIssue({
      code: 'custom',
      path: ['attendanceStartMinutes'],
      message: 'Set a check-in time for custom hours',
    })
  }
  if (value.attendanceEndMinutes == null) {
    context.addIssue({
      code: 'custom',
      path: ['attendanceEndMinutes'],
      message: 'Set a check-out time for custom hours',
    })
  }
  if (
    value.attendanceStartMinutes != null &&
    value.attendanceEndMinutes != null &&
    value.attendanceEndMinutes <= value.attendanceStartMinutes
  ) {
    context.addIssue({
      code: 'custom',
      path: ['attendanceEndMinutes'],
      message: 'Check-out must be after check-in',
    })
  }
}

export const staffCreateSchema = staffBaseSchema
  .extend({
    createLogin: z.coerce.boolean().default(false),
    roleKey: z.string().optional(),
  })
  .superRefine(refineCustomAttendanceHours)

export const staffUpdateSchema = staffBaseSchema.partial().superRefine(refineCustomAttendanceHours)

export const STAFF_SORT_FIELDS = ['firstName', 'lastName', 'employeeCode', 'joinedOn'] as const

export type StaffRow = {
  id: string
  userId: string | null
  employeeCode: string
  firstName: string
  lastName: string
  staffType: string
  designation: string | null
  department: string | null
  phone: string | null
  email: string | null
  hasLogin: boolean
  classCount: number
  isClassTeacherOf: string | null
}

export async function listStaff(
  ctx: AppContext,
  query: ListQuery,
  filter: { staffType?: string },
): Promise<{ rows: StaffRow[]; total: number }> {
  ctx.require('staff.view')

  const where: Prisma.StaffWhereInput = {
    deletedAt: null,
    ...(filter.staffType ? { staffType: filter.staffType as never } : {}),
    ...(query.q
      ? {
          OR: [
            { firstName: { contains: query.q, mode: 'insensitive' } },
            { lastName: { contains: query.q, mode: 'insensitive' } },
            { employeeCode: { contains: query.q, mode: 'insensitive' } },
            { phone: { contains: query.q } },
            { designation: { contains: query.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  }

  const orderBy = orderByFrom(query.sort, query.dir, STAFF_SORT_FIELDS, { firstName: 'asc' })

  const [rows, total] = await Promise.all([
    ctx.db.staff.findMany({
      where,
      orderBy,
      ...skipTake(query),
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        staffType: true,
        designation: true,
        department: true,
        phone: true,
        email: true,
        userId: true,
        _count: { select: { classSubjects: true } },
        classTeacherOf: {
          take: 1,
          select: { name: true, classLevel: { select: { name: true } } },
        },
      },
    }),
    ctx.db.staff.count({ where }),
  ])

  return {
    total,
    rows: rows.map((s) => ({
      id: s.id,
      userId: s.userId,
      employeeCode: s.employeeCode,
      firstName: s.firstName,
      lastName: s.lastName,
      staffType: s.staffType,
      designation: s.designation,
      department: s.department,
      phone: s.phone,
      email: s.email,
      hasLogin: !!s.userId,
      classCount: s._count.classSubjects,
      isClassTeacherOf: s.classTeacherOf[0]
        ? `${s.classTeacherOf[0].classLevel.name} ${s.classTeacherOf[0].name}`
        : null,
    })),
  }
}

export async function getStaff(ctx: AppContext, id: string) {
  ctx.require('staff.view')

  const staff = await ctx.db.staff.findFirst({
    where: { id, deletedAt: null },
    include: {
      user: { select: { id: true, email: true, status: true, lastLoginAt: true } },
      classSubjects: {
        include: {
          subject: { select: { name: true, code: true } },
          classLevel: { select: { name: true } },
        },
      },
      classTeacherOf: { select: { id: true, name: true, classLevel: { select: { name: true } } } },
      leaveRequests: { orderBy: { createdAt: 'desc' }, take: 5 },
    },
  })
  if (!staff) throw notFound('Staff member')

  // Payroll is a separate right from viewing the personnel record.
  if (!ctx.can('staff.payroll')) {
    return { ...staff, salaryMinor: null, bankAccount: null }
  }
  return staff
}

export async function createStaff(
  ctx: AppContext,
  input: z.infer<typeof staffCreateSchema>,
): Promise<{ staff: { id: string }; temporaryPassword?: string }> {
  ctx.require('staff.create')

  const activeCount = await ctx.db.staff.count({ where: { deletedAt: null } })
  await assertWithinLimit(ctx.tenant.id, FEATURE.LIMIT_STAFF, activeCount)

  const clash = await ctx.db.staff.findFirst({
    where: { employeeCode: input.employeeCode, deletedAt: null },
    select: { id: true },
  })
  if (clash) throw conflict(`Employee code ${input.employeeCode} is already in use`)

  const phone = storePhone(input.phone)
  const email = input.email?.trim().toLowerCase() || undefined

  let userId: string | undefined
  let temporaryPassword: string | undefined

  if (input.createLogin) {
    if (!phone) {
      throw new ApiException(
        400,
        'BAD_REQUEST',
        'A phone number is needed to create a portal login',
      )
    }
    temporaryPassword = staffInitialPassword(input.employeeCode)
    await assertPhoneAvailable(ctx, phone)

    const roleKey = input.roleKey || defaultRoleForStaffType(input.staffType)
    const role = await ctx.db.role.findFirst({
      where: { key: roleKey, OR: [{ tenantId: null }, { tenantId: ctx.tenant.id }] },
    })

    const user = await ctx.db.user.create({
      data: {
        tenantId: ctx.tenant.id,
        email: email ?? null,
        phone,
        passwordHash: await hashPassword(temporaryPassword),
        firstName: input.firstName,
        lastName: input.lastName,
        mustChangePassword: true,
        ...(role ? { roles: { create: { roleId: role.id } } } : {}),
      },
    })
    userId = user.id
  }

  const { createLogin: _c, roleKey: _r, ...fields } = input

  const staff = await ctx.db.staff.create({
    data: {
      ...fields,
      phone,
      email: email ?? null,
      userId,
      tenantId: ctx.tenant.id,
    },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'staff.create',
    module: 'staff',
    entityType: 'Staff',
    entityId: staff.id,
    summary: `Added ${staff.firstName} ${staff.lastName} (${staff.employeeCode})${userId ? ' with a login' : ''}`,
    after: staff,
  })

  return { staff, temporaryPassword }
}

/**
 * Issues (or re-issues) a staff portal login.
 *
 * Username = phone. Password = employee code. Does not overwrite an existing
 * account unless `reset: true`.
 */
export async function issueStaffPortalLogin(
  ctx: AppContext,
  staffId: string,
  opts?: { reset?: boolean; roleKey?: string },
): Promise<{ temporaryPassword: string; userId: string }> {
  if (!ctx.can('users.create') && !ctx.can('staff.create') && !ctx.can('staff.edit')) {
    ctx.require('users.create')
  }

  const staff = await ctx.db.staff.findFirst({
    where: { id: staffId, deletedAt: null },
  })
  if (!staff) throw notFound('Staff member')

  const phone = storePhone(staff.phone)
  if (!phone) {
    throw new ApiException(
      400,
      'BAD_REQUEST',
      'A phone number is needed to create a staff portal login',
    )
  }

  const temporaryPassword = staffInitialPassword(staff.employeeCode)

  if (staff.userId && !opts?.reset) {
    throw conflict('This staff member already has a portal login')
  }

  await assertPhoneAvailable(ctx, phone, staff.userId ?? undefined)

  const roleKey = opts?.roleKey || defaultRoleForStaffType(staff.staffType)
  const role = await ctx.db.role.findFirst({
    where: { key: roleKey, OR: [{ tenantId: null }, { tenantId: ctx.tenant.id }] },
  })
  const passwordHash = await hashPassword(temporaryPassword)

  let userId = staff.userId
  if (userId) {
    await ctx.db.user.update({
      where: { id: userId },
      data: {
        phone,
        passwordHash,
        mustChangePassword: true,
        tempPasswordExpiresAt: null,
        status: 'ACTIVE',
        failedLoginCount: 0,
        lockedUntil: null,
      },
    })
  } else {
    const user = await ctx.db.user.create({
      data: {
        tenantId: ctx.tenant.id,
        email: staff.email,
        phone,
        passwordHash,
        firstName: staff.firstName,
        lastName: staff.lastName,
        mustChangePassword: true,
        ...(role ? { roles: { create: { roleId: role.id } } } : {}),
      },
    })
    userId = user.id
    await ctx.db.staff.update({ where: { id: staffId }, data: { userId, phone } })
  }

  if (staff.phone !== phone) {
    await ctx.db.staff.update({ where: { id: staffId }, data: { phone } })
  }

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'staff.issue_login',
    module: 'staff',
    entityType: 'Staff',
    entityId: staffId,
    summary: `Issued portal login for ${staff.firstName} ${staff.lastName} (${staff.employeeCode})`,
  })

  return { temporaryPassword, userId }
}

export type StaffTempPasswordIssued = {
  staffId: string
  name: string
  employeeCode: string
  phone: string
  password: string
  expiresAt: string
  createdLogin: boolean
}

export type StaffTempPasswordSkipped = {
  staffId: string
  name: string
  employeeCode: string
  reason: string
}

const BULK_TEMP_PASSWORD_MAX = 150

/**
 * Issues one-time temporary passwords for many staff at once.
 *
 * Creates a portal login when none exists; resets an existing account otherwise.
 * Plaintexts are returned once for a CSV handover — same rules as Settings → Users
 * Temp password (24h expiry, must change at first sign-in, sessions revoked).
 */
export async function bulkIssueStaffTempPasswords(
  ctx: AppContext,
  input: { staffIds?: string[]; all?: boolean; staffType?: string },
): Promise<{ issued: StaffTempPasswordIssued[]; skipped: StaffTempPasswordSkipped[] }> {
  ctx.require('users.edit')

  let ids: string[]
  if (input.all) {
    const rows = await ctx.db.staff.findMany({
      where: {
        deletedAt: null,
        ...(input.staffType ? { staffType: input.staffType as never } : {}),
      },
      select: { id: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      take: BULK_TEMP_PASSWORD_MAX,
    })
    ids = rows.map((row) => row.id)
  } else {
    ids = [...new Set(input.staffIds ?? [])].slice(0, BULK_TEMP_PASSWORD_MAX)
  }

  if (ids.length === 0) {
    return { issued: [], skipped: [] }
  }

  const staffRows = await ctx.db.staff.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeCode: true,
      phone: true,
      email: true,
      userId: true,
      staffType: true,
      user: { select: { id: true, status: true } },
    },
  })

  const issued: StaffTempPasswordIssued[] = []
  const skipped: StaffTempPasswordSkipped[] = []

  for (const staff of staffRows) {
    const name = `${staff.firstName} ${staff.lastName}`.trim()
    const base = {
      staffId: staff.id,
      name,
      employeeCode: staff.employeeCode,
    }

    try {
      if (staff.userId && staff.userId === ctx.user.userId) {
        skipped.push({ ...base, reason: 'Use Account → Password for your own account' })
        continue
      }

      const phone = storePhone(staff.phone)
      if (!phone) {
        skipped.push({ ...base, reason: 'No phone number on file' })
        continue
      }

      if (staff.user?.status === 'DISABLED') {
        skipped.push({ ...base, reason: 'Account is disabled — re-enable it first' })
        continue
      }

      if (staff.userId) {
        const result = await setTemporaryPassword(ctx, staff.userId)
        issued.push({
          ...base,
          phone,
          password: result.password,
          expiresAt: result.expiresAt.toISOString(),
          createdLogin: false,
        })
        continue
      }

      await assertPhoneAvailable(ctx, phone)
      const plain = generateTemporaryPassword()
      const expiresAt = new Date(Date.now() + TEMP_PASSWORD_TTL_HOURS * 3600_000)
      const roleKey = defaultRoleForStaffType(staff.staffType)
      const role = await ctx.db.role.findFirst({
        where: { key: roleKey, OR: [{ tenantId: null }, { tenantId: ctx.tenant.id }] },
      })

      const user = await ctx.db.user.create({
        data: {
          tenantId: ctx.tenant.id,
          email: staff.email,
          phone,
          passwordHash: await hashPassword(plain),
          firstName: staff.firstName,
          lastName: staff.lastName,
          mustChangePassword: true,
          tempPasswordExpiresAt: expiresAt,
          passwordChangedAt: new Date(),
          ...(role ? { roles: { create: { roleId: role.id } } } : {}),
        },
      })

      await ctx.db.staff.update({
        where: { id: staff.id },
        data: { userId: user.id, phone },
      })

      await audit({
        tenantId: ctx.tenant.id,
        actorId: ctx.user.userId,
        actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
        action: 'staff.issue_login',
        module: 'staff',
        entityType: 'Staff',
        entityId: staff.id,
        summary: `Issued temporary portal login for ${name} (${staff.employeeCode})`,
      })

      issued.push({
        ...base,
        phone,
        password: plain,
        expiresAt: expiresAt.toISOString(),
        createdLogin: true,
      })
    } catch (err) {
      skipped.push({
        ...base,
        reason: err instanceof Error ? err.message : 'Could not issue a password',
      })
    }
  }

  return { issued, skipped }
}

/**
 * Issues a Settings-style temporary password for one staff member.
 * Creates a portal login when needed; resets when one already exists.
 */
export async function issueStaffTempPassword(
  ctx: AppContext,
  staffId: string,
): Promise<{ password: string; expiresAt: Date; name: string; createdLogin: boolean }> {
  const result = await bulkIssueStaffTempPasswords(ctx, { staffIds: [staffId] })
  const row = result.issued[0]
  if (row) {
    return {
      password: row.password,
      expiresAt: new Date(row.expiresAt),
      name: row.name,
      createdLogin: row.createdLogin,
    }
  }
  const skip = result.skipped[0]
  throw new ApiException(
    400,
    'BAD_REQUEST',
    skip?.reason ?? 'Could not issue a temporary password',
  )
}

function defaultRoleForStaffType(type: string): string {
  switch (type) {
    case 'TEACHING':
      return ROLE.TEACHER
    case 'ACCOUNTANT':
      return ROLE.ACCOUNTANT
    case 'LIBRARIAN':
      return ROLE.LIBRARIAN
    case 'DRIVER':
      return ROLE.DRIVER
    default:
      return ROLE.FRONT_DESK
  }
}

export async function updateStaff(
  ctx: AppContext,
  id: string,
  input: z.infer<typeof staffUpdateSchema>,
) {
  ctx.require('staff.edit')

  const before = await ctx.db.staff.findFirst({ where: { id, deletedAt: null } })
  if (!before) throw notFound('Staff member')

  if (input.salaryMinor !== undefined && !ctx.can('staff.payroll')) {
    throw new ApiException(403, 'FORBIDDEN', 'You cannot change salary details')
  }

  const updated = await ctx.db.staff.update({ where: { id }, data: input })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'staff.update',
    module: 'staff',
    entityType: 'Staff',
    entityId: id,
    summary: `Updated ${updated.firstName} ${updated.lastName}`,
    before,
    after: updated,
  })
  return updated
}

/**
 * Archives a staff member. Refuses while they are still a class teacher or hold
 * subject assignments, so a class is never left without a responsible adult.
 */
export async function archiveStaff(ctx: AppContext, id: string, reason?: string) {
  ctx.require('staff.delete')

  const staff = await ctx.db.staff.findFirst({
    where: { id, deletedAt: null },
    include: {
      classTeacherOf: { select: { name: true, classLevel: { select: { name: true } } } },
      _count: { select: { classSubjects: true } },
    },
  })
  if (!staff) throw notFound('Staff member')

  if (staff.classTeacherOf.length > 0) {
    const list = staff.classTeacherOf
      .map((s) => `${s.classLevel.name} ${s.name}`)
      .join(', ')
    throw conflict(`Assign a new class teacher for ${list} before archiving this staff member`)
  }
  if (staff._count.classSubjects > 0) {
    throw conflict(
      `Reassign the ${staff._count.classSubjects} subject${staff._count.classSubjects === 1 ? '' : 's'} taught by this staff member first`,
    )
  }

  const archived = await ctx.db.$transaction(async (tx) => {
    if (staff.userId) {
      await tx.user.update({ where: { id: staff.userId }, data: { status: 'DISABLED' } })
      await tx.session.updateMany({
        where: { userId: staff.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      })
    }
    return tx.staff.update({
      where: { id },
      data: { deletedAt: new Date(), leftOn: new Date() },
    })
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'staff.archive',
    module: 'staff',
    entityType: 'Staff',
    entityId: id,
    summary: `Archived ${staff.firstName} ${staff.lastName} and revoked their sessions${reason ? ` - ${reason}` : ''}`,
    before: staff,
  })
  return archived
}

/** Teacher options for the class-teacher picker. */
export async function teacherOptions(ctx: AppContext) {
  return ctx.db.staff.findMany({
    where: { deletedAt: null, leftOn: null, staffType: 'TEACHING' },
    orderBy: { firstName: 'asc' },
    select: { id: true, firstName: true, lastName: true, employeeCode: true },
  })
}
