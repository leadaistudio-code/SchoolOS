import { prisma } from '@/server/db/prisma'

/**
 * The login behind a parent's secondary number, or null.
 *
 * Only a fallback: callers try the account's own `phone` first, so a number
 * that is someone's primary always means that person.
 */
export async function parentUserIdBySecondaryPhone(
  tenantId: string,
  candidates: string[],
): Promise<string | null> {
  if (candidates.length === 0) return null
  const parent = await prisma.parent.findFirst({
    where: { tenantId, deletedAt: null, secondaryPhone: { in: candidates }, userId: { not: null } },
    select: { userId: true },
  })
  return parent?.userId ?? null
}
