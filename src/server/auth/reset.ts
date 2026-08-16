import { prisma } from '@/server/db/prisma'
import { audit } from '@/server/audit'
import { createPasswordResetTicket } from '@/server/modules/platform/support'
import { tenantEmailProvider } from '@/server/mail/smtp'
import { inviteEmail, passwordResetEmail } from '@/server/mail/auth-emails'
import { rateLimit, RATE_LIMITS } from '@/server/rate-limit'
import { tenantUrl } from '@/server/tenant'
import { checkPasswordPolicy, hashPassword, verifyPassword } from './password'
import { requestMeta, revokeAllSessions } from './session'
import { consumeToken, issueToken, verifyToken, type OneTimePurpose } from './tokens'

export type TenantRef = { id: string; slug: string; name: string }

/**
 * Self-service password reset and account activation.
 *
 * Replaces the operator-run `scripts/reset-user-password.ts` for everyone
 * except platform super admins, who have no tenant host to receive a link on
 * and remain deliberately CLI-only.
 */

/**
 * Identical for every outcome, so the form cannot confirm who has an account.
 *
 * Which of the two is used depends on whether the school can send mail at all
 * — a property of the school, not of the person asking, so choosing between
 * them still tells an attacker nothing about the address they typed.
 */
const ACK_EMAILED =
  'If an account exists for that email, we have sent a link to reset the password. It expires in an hour — check your spam folder if it does not arrive.'
const ACK_TICKETED =
  'If an account exists for that email, our platform team has been notified and will contact you to reset it.'

export type ResetRequestOutcome = {
  ok: true
  message: string
  retryAfterSeconds?: number
}

/**
 * Whether a reset link can actually reach someone at this school.
 *
 * This asks the resolved provider what it is rather than trusting
 * EMAIL_DRIVER, because that setting accepts names (`ses`, `resend`) that have
 * no implementation yet and quietly fall back to the log driver. Believing the
 * setting would mean posting reset links into a log file and telling the user
 * to check their inbox.
 */
export async function canDeliverEmail(tenantId: string): Promise<boolean> {
  const provider = await tenantEmailProvider(tenantId)
  return provider.name !== 'log'
}

/**
 * Requests a reset link.
 *
 * Always reports success. An unknown address, a disabled account and a
 * successful send are indistinguishable to the caller - the whole point of
 * this endpoint is that it must not answer "does this person go here?", which
 * for a school is a safeguarding question and not merely a security one.
 */
export async function requestPasswordReset(
  identifier: string,
  tenant: TenantRef,
): Promise<ResetRequestOutcome> {
  const email = identifier.trim().toLowerCase()
  const meta = await requestMeta()
  const emailable = await canDeliverEmail(tenant.id)
  const ack = emailable ? ACK_EMAILED : ACK_TICKETED

  const byEmail = await rateLimit(
    `pwreset:id:${tenant.id}:${email}`,
    RATE_LIMITS.passwordResetRequest.limit,
    RATE_LIMITS.passwordResetRequest.windowSeconds,
  )
  const byIp = await rateLimit(
    `pwreset:ip:${meta.ip ?? 'unknown'}`,
    RATE_LIMITS.passwordResetRequest.limit * 5,
    RATE_LIMITS.passwordResetRequest.windowSeconds,
  )

  // Even when throttled the answer is the acknowledgement, not a refusal:
  // "too many requests for that address" would itself confirm the address.
  if (!byEmail.ok || !byIp.ok) {
    return {
      ok: true,
      message: ack,
      retryAfterSeconds: Math.max(byEmail.retryAfterSeconds, byIp.retryAfterSeconds),
    }
  }

  // No mailbox anywhere in the chain: fall back to the operator-run path so
  // the user is handled by a human rather than silently ignored.
  if (!emailable) {
    await createPasswordResetTicket({
      email,
      tenantId: tenant.id,
      tenantName: tenant.name,
      ip: meta.ip,
    })
    return { ok: true, message: ack }
  }

  const user = await prisma.user.findFirst({
    where: { tenantId: tenant.id, email, deletedAt: null, status: 'ACTIVE' },
    select: { id: true, firstName: true, lastName: true, email: true },
  })

  if (!user?.email) return { ok: true, message: ack }

  await deliver(user.id, 'PASSWORD_RESET', tenant, {
    email: user.email,
    firstName: user.firstName,
  })

  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorLabel: `${user.firstName} ${user.lastName}`,
    action: 'auth.password_reset.request',
    module: 'auth',
    entityType: 'User',
    entityId: user.id,
    summary: 'Requested a password reset link',
  })

  return { ok: true, message: ack }
}

/** Issues a token and mails the matching link. Shared by reset and invite. */
async function deliver(
  userId: string,
  purpose: OneTimePurpose,
  tenant: TenantRef,
  recipient: { email: string; firstName: string },
): Promise<void> {
  const { token, expiresAt } = await issueToken(userId, purpose)
  const path = purpose === 'INVITE' ? '/accept-invite' : '/reset-password'
  const url = tenantUrl(tenant.slug, `${path}?token=${encodeURIComponent(token)}`)

  const build = purpose === 'INVITE' ? inviteEmail : passwordResetEmail
  const message = build(recipient, { schoolName: tenant.name, url, expiresAt })

  const provider = await tenantEmailProvider(tenant.id)
  const result = await provider.send(message)

  // A send failure must not leak back to the form - it would distinguish a
  // real address from an unknown one. It is logged for operators instead.
  if (!result.ok) {
    console.error('[auth] failed to send %s email', purpose, result.error)
  }
}

export type RedeemView =
  | { valid: true; firstName: string; email: string | null }
  | { valid: false }

/** Checks a link before showing its form, without spending the token. */
export async function inspectToken(
  token: string,
  purpose: OneTimePurpose,
  tenantId: string,
): Promise<RedeemView> {
  const row = await verifyToken(token, purpose, tenantId)
  if (!row) return { valid: false }
  return { valid: true, firstName: row.firstName, email: row.email }
}

export type CompleteOutcome =
  | { ok: true }
  | { ok: false; field: 'token' | 'password'; message: string }

const EXPIRED =
  'This link is no longer valid. It may have expired or already been used - request a new one.'

/**
 * Sets a new password from a reset or invite link.
 *
 * Notably this does NOT sign the user in. Dropping them onto the sign-in page
 * means MFA still applies: an auto-session here would turn a mailbox
 * compromise into a way around the second factor.
 */
export async function completeWithToken(
  token: string,
  purpose: OneTimePurpose,
  tenantId: string,
  newPassword: string,
): Promise<CompleteOutcome> {
  const meta = await requestMeta()
  const limited = await rateLimit(
    `pwreset:redeem:${meta.ip ?? 'unknown'}`,
    RATE_LIMITS.passwordReset.limit,
    RATE_LIMITS.passwordReset.windowSeconds,
  )
  if (!limited.ok) {
    return { ok: false, field: 'token', message: 'Too many attempts. Please wait a few minutes.' }
  }

  const row = await verifyToken(token, purpose, tenantId)
  if (!row) return { ok: false, field: 'token', message: EXPIRED }

  const issues = checkPasswordPolicy(newPassword)
  if (issues.length > 0) {
    return { ok: false, field: 'password', message: issues.join('. ') }
  }

  const current = await prisma.user.findUnique({
    where: { id: row.userId },
    select: { passwordHash: true, firstName: true, lastName: true },
  })
  if (current?.passwordHash && (await verifyPassword(newPassword, current.passwordHash))) {
    return {
      ok: false,
      field: 'password',
      message: 'Choose a password you have not used here before',
    }
  }

  const passwordHash = await hashPassword(newPassword)

  // The token is spent in the same commit as the password write, so a failure
  // either leaves the link usable or the password changed - never both spent
  // and unchanged.
  const applied = await prisma.$transaction(async (tx) => {
    if (!(await consumeToken(tx, row.id))) return false
    await tx.user.update({
      where: { id: row.userId },
      data: {
        passwordHash,
        passwordChangedAt: new Date(),
        mustChangePassword: false,
        tempPasswordExpiresAt: null,
        // A locked-out user resetting their password is the intended way out
        // of a lockout; leaving the counter set would strand them.
        failedLoginCount: 0,
        lockedUntil: null,
        // Redeeming a link proves control of the mailbox.
        ...(row.email ? { emailVerifiedAt: new Date() } : {}),
        ...(purpose === 'INVITE' ? { status: 'ACTIVE' as const } : {}),
      },
    })
    return true
  })

  if (!applied) return { ok: false, field: 'token', message: EXPIRED }

  // Any session that existed before a reset may belong to whoever caused the
  // reset to be needed.
  await revokeAllSessions(row.userId)

  await audit({
    tenantId,
    actorId: row.userId,
    actorLabel: `${current?.firstName ?? row.firstName} ${current?.lastName ?? row.lastName}`,
    action: purpose === 'INVITE' ? 'auth.invite.accept' : 'auth.password_reset.complete',
    module: 'auth',
    entityType: 'User',
    entityId: row.userId,
    summary:
      purpose === 'INVITE'
        ? 'Activated their account from an invitation'
        : 'Reset their password and signed out all devices',
  })

  return { ok: true }
}

/**
 * Sends an account link on an administrator's behalf: an invitation for a
 * person who has never signed in, a reset for one who has. The distinction is
 * drawn here rather than at the button, so the mail, the landing page and the
 * audit entry can never disagree about which one was sent.
 *
 * Unlike the self-service request this reports failures honestly — the caller
 * is school staff acting on an account they already administer, so there is no
 * enumeration to protect against and a silent no-op would be a support call.
 */
export async function sendAccountLink(
  userId: string,
  tenant: TenantRef,
): Promise<{ ok: boolean; message: string }> {
  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId: tenant.id, deletedAt: null },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      status: true,
      passwordHash: true,
    },
  })

  if (!user) return { ok: false, message: 'That user no longer exists.' }
  if (user.status === 'DISABLED') {
    return { ok: false, message: 'This account is disabled. Re-enable it before sending a link.' }
  }
  if (!user.email) {
    return { ok: false, message: 'Add an email address to this account before sending a link.' }
  }

  const purpose: OneTimePurpose =
    user.status === 'INVITED' || !user.passwordHash ? 'INVITE' : 'PASSWORD_RESET'

  await deliver(user.id, purpose, tenant, { email: user.email, firstName: user.firstName })

  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorLabel: `${user.firstName} ${user.lastName}`,
    action: purpose === 'INVITE' ? 'auth.invite.send' : 'auth.password_reset.send',
    module: 'auth',
    entityType: 'User',
    entityId: user.id,
    summary:
      purpose === 'INVITE'
        ? `Sent an account invitation to ${user.email}`
        : `Sent a password reset link to ${user.email}`,
  })

  return {
    ok: true,
    message:
      purpose === 'INVITE'
        ? `Invitation sent to ${user.email}.`
        : `Reset link sent to ${user.email}.`,
  }
}
