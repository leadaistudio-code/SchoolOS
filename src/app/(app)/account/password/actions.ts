'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { getContext } from '@/server/context'
import { prisma } from '@/server/db/prisma'
import { checkPasswordPolicy, hashPassword, verifyPassword } from '@/server/auth/password'
import { revokeAllSessions } from '@/server/auth/session'
import { audit } from '@/server/audit'
import { rateLimit, RATE_LIMITS } from '@/server/rate-limit'
import type { FormState as PasswordState } from '@/lib/form-state'

const schema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: z.string().min(1, 'Enter a new password'),
    confirmPassword: z.string().min(1, 'Confirm the new password'),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'The two passwords do not match',
  })



/**
 * Changing a password revokes every OTHER session for the account. If the
 * password was changed because it may have leaked, leaving the attacker signed
 * in elsewhere would defeat the point.
 */
export async function changePasswordAction(
  _prev: PasswordState,
  formData: FormData,
): Promise<PasswordState> {
  const ctx = await getContext()
  if (!ctx) redirect('/login')

  const limited = await rateLimit(
    `password-change:${ctx.user.userId}`,
    RATE_LIMITS.passwordReset.limit,
    RATE_LIMITS.passwordReset.windowSeconds,
  )
  if (!limited.ok) {
    return { error: 'Too many attempts. Please wait a few minutes.', fieldErrors: {} }
  }

  const parsed = schema.safeParse(Object.fromEntries(formData.entries()))
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message
    return { error: null, fieldErrors }
  }

  const user = await prisma.user.findUnique({ where: { id: ctx.user.userId } })
  if (!user?.passwordHash) return { error: 'Password sign-in is not enabled for this account', fieldErrors: {} }

  if (!(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) {
    return { error: null, fieldErrors: { currentPassword: 'That is not your current password' } }
  }

  const issues = checkPasswordPolicy(parsed.data.newPassword)
  if (issues.length > 0) {
    return { error: null, fieldErrors: { newPassword: issues.join('. ') } }
  }

  if (await verifyPassword(parsed.data.newPassword, user.passwordHash)) {
    return { error: null, fieldErrors: { newPassword: 'Choose a password you have not used here before' } }
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(parsed.data.newPassword),
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

  redirect('/')
}
