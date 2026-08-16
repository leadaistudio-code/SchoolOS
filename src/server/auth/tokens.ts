import type { Prisma } from '@prisma/client'
import { prisma } from '@/server/db/prisma'
import { randomToken, sha256 } from '@/server/crypto'

/**
 * One-time link tokens.
 *
 * Password resets and invitations are the same mechanism with different
 * lifetimes: a high-entropy token handed to exactly one person, stored only as
 * a SHA-256 hash so a database leak cannot be replayed into account takeover.
 * The plaintext exists once, in the email we send, and is never written down.
 *
 * MFA challenges (OTP_LOGIN) use the same table but live in the MFA service,
 * because they consume into a session rather than into a password.
 */
export type OneTimePurpose = 'PASSWORD_RESET' | 'INVITE'

/**
 * A reset link is short-lived because it arrives in a mailbox that may be
 * shared — school offices routinely have one. An invite is long-lived because
 * it is often sent during holidays and has no standing value: the account has
 * no password to steal until it is redeemed.
 */
export const TOKEN_TTL_MINUTES: Record<OneTimePurpose, number> = {
  PASSWORD_RESET: 60,
  INVITE: 7 * 24 * 60,
}

export type IssuedToken = {
  /** Plaintext, for the link only. Never persist or log this. */
  token: string
  expiresAt: Date
}

/**
 * Issues a token, invalidating any earlier unused token of the same purpose
 * for that user. Without this, every "resend" would leave another live key
 * under the doormat.
 */
export async function issueToken(
  userId: string,
  purpose: OneTimePurpose,
  /**
   * Overrides the default lifetime. Used by the OTP exchange, where the phone
   * has just been proved and the only remaining step is typing a password —
   * an hour of standing validity would be generous for that.
   */
  ttlMinutes?: number,
  /** Joins a caller's transaction, so minting can share their commit. */
  tx?: Prisma.TransactionClient,
): Promise<IssuedToken> {
  const token = randomToken(32)
  const expiresAt = new Date(Date.now() + (ttlMinutes ?? TOKEN_TTL_MINUTES[purpose]) * 60_000)

  const write = async (db: Prisma.TransactionClient) => {
    await db.verificationToken.updateMany({
      where: { userId, purpose, usedAt: null },
      data: { usedAt: new Date() },
    })
    await db.verificationToken.create({
      data: { userId, purpose, tokenHash: sha256(token), expiresAt },
    })
  }

  // Retiring the old token and minting the new one must land together; a
  // caller already inside a transaction supplies its own client so the whole
  // exchange shares one commit.
  if (tx) await write(tx)
  else await prisma.$transaction(write)

  return { token, expiresAt }
}

export type VerifiedToken = {
  id: string
  userId: string
  tenantId: string | null
  firstName: string
  lastName: string
  email: string | null
  hasPassword: boolean
}

/**
 * Checks a token without spending it, so the reset page can render a form (or
 * an honest "this link has expired") before the user types anything.
 *
 * `tenantId` binds the token to the school whose host the link was opened on:
 * the token already names its user, but refusing a cross-tenant redemption
 * keeps one school's links from doing anything at all on another's domain.
 */
export async function verifyToken(
  token: string,
  purpose: OneTimePurpose,
  tenantId: string | null,
): Promise<VerifiedToken | null> {
  if (!token) return null

  const row = await prisma.verificationToken.findFirst({
    where: {
      tokenHash: sha256(token),
      purpose,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: {
      user: {
        select: {
          id: true,
          tenantId: true,
          status: true,
          deletedAt: true,
          firstName: true,
          lastName: true,
          email: true,
          passwordHash: true,
        },
      },
    },
  })

  if (!row || row.user.deletedAt) return null
  if (row.user.tenantId !== tenantId) return null

  // An invite is the one case where a non-ACTIVE user may proceed — redeeming
  // it is what makes them active.
  if (row.user.status === 'DISABLED') return null
  if (purpose === 'PASSWORD_RESET' && row.user.status !== 'ACTIVE') return null

  return {
    id: row.id,
    userId: row.user.id,
    tenantId: row.user.tenantId,
    firstName: row.user.firstName,
    lastName: row.user.lastName,
    email: row.user.email,
    hasPassword: !!row.user.passwordHash,
  }
}

/**
 * Spends a token. Takes a transaction client so the token is consumed in the
 * same commit that writes the new password — otherwise a crash between the two
 * either burns a valid link or leaves a spent one usable.
 */
export async function consumeToken(
  tx: Prisma.TransactionClient,
  tokenId: string,
): Promise<boolean> {
  const result = await tx.verificationToken.updateMany({
    where: { id: tokenId, usedAt: null },
    data: { usedAt: new Date() },
  })
  return result.count === 1
}
