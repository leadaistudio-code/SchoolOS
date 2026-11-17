import type { Prisma } from '@prisma/client'

/**
 * Open fee balances that the school still expects to collect.
 * Dropped-out (WITHDRAWN) students are excluded — their unpaid balance is
 * reported separately as bad debt.
 */
export const COLLECTIBLE_STUDENT: Prisma.StudentWhereInput = {
  status: 'ACTIVE',
  deletedAt: null,
}

/** Unpaid balances for students marked dropped out. */
export const BAD_DEBT_STUDENT: Prisma.StudentWhereInput = {
  status: 'WITHDRAWN',
}

export function withCollectibleStudent(
  student?: Prisma.StudentWhereInput,
): Prisma.StudentWhereInput {
  return student ? { AND: [COLLECTIBLE_STUDENT, student] } : COLLECTIBLE_STUDENT
}

export function withBadDebtStudent(
  student?: Prisma.StudentWhereInput,
): Prisma.StudentWhereInput {
  return student ? { AND: [BAD_DEBT_STUDENT, student] } : BAD_DEBT_STUDENT
}
