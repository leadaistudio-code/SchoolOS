import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { ApiException, notFound } from '@/server/api/response'
import { generateTemporaryPassword, hashPassword } from '@/server/auth/password'
import { ROLE } from '@/lib/rbac/roles'
import { TEMP_PASSWORD_TTL_HOURS } from '@/server/modules/settings/users'

export type IssuedStudentLogin = {
  username: string
  password: string
  expiresAt: Date
  created: boolean
}

/**
 * Issues (or re-issues) a student's own portal login.
 *
 * Username = admission number, which is unique within the school and which
 * every student already knows; most have no phone or email of their own.
 * The password is random rather than derived from the student's details,
 * because classmates know each other's names and birthdays. It expires in
 * a day, must be changed at first sign-in, and re-issuing it signs out every
 * device already on the account.
 */
export async function issueStudentPortalLogin(
  ctx: AppContext,
  studentId: string,
): Promise<IssuedStudentLogin> {
  if (!ctx.can('users.create') && !ctx.can('students.edit')) ctx.require('users.create')

  const student = await ctx.db.student.findFirst({
    where: { id: studentId, deletedAt: null },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      admissionNo: true,
      status: true,
      userId: true,
      user: { select: { id: true, status: true, deletedAt: true } },
    },
  })
  if (!student) throw notFound('Student')

  if (student.status !== 'ACTIVE') {
    throw new ApiException(
      409,
      'CONFLICT',
      'Only students currently on the roll can be given a login.',
    )
  }
  if (student.user?.status === 'DISABLED') {
    throw new ApiException(
      409,
      'CONFLICT',
      'This student’s login is disabled. Re-enable it in Settings → Users first.',
    )
  }

  const password = generateTemporaryPassword()
  const passwordHash = await hashPassword(password)
  const expiresAt = new Date(Date.now() + TEMP_PASSWORD_TTL_HOURS * 3600_000)
  const existing = student.user && !student.user.deletedAt ? student.user.id : null

  const role = await ctx.db.role.findFirst({
    where: { key: ROLE.STUDENT, OR: [{ tenantId: null }, { tenantId: ctx.tenant.id }] },
    select: { id: true },
  })
  if (!role) throw new ApiException(500, 'INTERNAL', 'The student role is missing for this school')

  await ctx.db.$transaction(async (tx) => {
    if (existing) {
      await tx.user.update({
        where: { id: existing },
        data: {
          passwordHash,
          passwordChangedAt: new Date(),
          mustChangePassword: true,
          tempPasswordExpiresAt: expiresAt,
          failedLoginCount: 0,
          lockedUntil: null,
          ...(student.user?.status === 'INVITED' ? { status: 'ACTIVE' as const } : {}),
        },
      })
      await tx.session.updateMany({
        where: { userId: existing, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      return
    }

    const user = await tx.user.create({
      data: {
        tenantId: ctx.tenant.id,
        firstName: student.firstName,
        lastName: student.lastName,
        passwordHash,
        passwordChangedAt: new Date(),
        mustChangePassword: true,
        tempPasswordExpiresAt: expiresAt,
        roles: { create: { roleId: role.id } },
      },
      select: { id: true },
    })
    await tx.student.update({ where: { id: student.id }, data: { userId: user.id } })
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'student.issue_login',
    module: 'students',
    entityType: 'Student',
    entityId: student.id,
    summary: `${existing ? 'Reset' : 'Issued'} portal login for ${student.firstName} ${student.lastName} (${student.admissionNo})`,
  })

  return { username: student.admissionNo, password, expiresAt, created: !existing }
}
