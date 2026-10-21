import { prisma } from '@/server/db/prisma'
import { checkPasswordPolicy, hashPassword, verifyPassword } from '@/server/auth/password'
import { revokeAllSessions } from '@/server/auth/session'
import { audit } from '@/server/audit'
import type { AppContext } from '@/server/context'

export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; field: 'currentPassword' | 'newPassword' | null; message: string }

/**
 * Changes the signed-in user's own password. Shared by the web form and the
 * mobile API so both apply the same policy.
 *
 * Every OTHER session for the account is revoked: if the password was changed
 * because it may have leaked, leaving the attacker signed in elsewhere would
 * defeat the point.
 */
export async function changeOwnPassword(
  ctx: AppContext,
  currentPassword: string,
  newPassword: string,
): Promise<ChangePasswordResult> {
  const user = await prisma.user.findUnique({ where: { id: ctx.user.userId } })
  if (!user?.passwordHash) {
    return { ok: false, field: null, message: 'Password sign-in is not enabled for this account' }
  }

  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    return { ok: false, field: 'currentPassword', message: 'That is not your current password' }
  }

  const issues = checkPasswordPolicy(newPassword, { roleKeys: ctx.user.roleKeys })
  if (issues.length > 0) {
    return { ok: false, field: 'newPassword', message: issues.join('. ') }
  }

  if (await verifyPassword(newPassword, user.passwordHash)) {
    return { ok: false, field: 'newPassword', message: 'Choose a password you have not used here before' }
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(newPassword),
      passwordChangedAt: new Date(),
      mustChangePassword: false,
      // Whatever temporary password brought them here is now spent.
      tempPasswordExpiresAt: null,
    },
  })

  await revokeAllSessions(user.id, ctx.user.sessionId)

  await audit({
    tenantId: ctx.tenant.id,
    actorId: user.id,
    actorLabel: `${user.firstName} ${user.lastName}`,
    action: 'auth.password_change',
    module: 'auth',
    entityType: 'User',
    entityId: user.id,
    summary: 'Changed password and signed out other devices',
  })

  return { ok: true }
}
