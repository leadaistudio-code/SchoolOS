import type { AppContext } from '@/server/context'
import { notFound } from '@/server/api/response'
import type { RawCapableClient } from '@/server/numbering'
import type { InvoiceStatus } from '@prisma/client'

/**
 * What the fee counter needs and nothing more.
 *
 * Collecting a payment is its own right (`fees.collect`). A front-desk cashier
 * or an accountant holds it without `students.view`, so the counter reads the
 * student and the open dues through these narrow queries instead of the
 * student directory and the invoice register.
 */

const OPEN_INVOICE = {
  balanceMinor: { gt: 0 },
  status: { notIn: ['CANCELLED', 'DRAFT'] as InvoiceStatus[] },
}

export async function searchCollectStudents(ctx: AppContext, q: string) {
  ctx.require('fees.collect')
  const term = q.trim()
  if (term.length < 2) return []
  const rows = await ctx.db.student.findMany({
    where: {
      deletedAt: null,
      OR: [
        { firstName: { contains: term, mode: 'insensitive' } },
        { lastName: { contains: term, mode: 'insensitive' } },
        { admissionNo: { contains: term, mode: 'insensitive' } },
        ...(term.includes(' ')
          ? [{
              AND: [
                { firstName: { contains: term.split(/\s+/)[0]!, mode: 'insensitive' as const } },
                { lastName: { contains: term.split(/\s+/).slice(1).join(' '), mode: 'insensitive' as const } },
              ],
            }]
          : []),
        {
          guardians: {
            some: {
              parent: {
                OR: [
                  { firstName: { contains: term, mode: 'insensitive' } },
                  { lastName: { contains: term, mode: 'insensitive' } },
                  { phone: { contains: term } },
                ],
              },
            },
          },
        },
      ],
    },
    orderBy: [{ status: 'asc' }, { firstName: 'asc' }],
    take: 8,
    select: {
      id: true,
      admissionNo: true,
      firstName: true,
      lastName: true,
      enrollments: {
        where: { isCurrent: true },
        take: 1,
        select: { classLevel: { select: { name: true } }, section: { select: { name: true } } },
      },
      guardians: {
        orderBy: { isPrimary: 'desc' },
        take: 1,
        select: { parent: { select: { firstName: true, lastName: true } } },
      },
      invoices: { where: OPEN_INVOICE, select: { balanceMinor: true } },
    },
  })
  return rows.map((s) => ({
    id: s.id,
    admissionNo: s.admissionNo,
    firstName: s.firstName,
    lastName: s.lastName,
    className: s.enrollments[0]?.classLevel.name ?? null,
    sectionName: s.enrollments[0]?.section.name ?? null,
    parentName: s.guardians[0]
      ? `${s.guardians[0].parent.firstName} ${s.guardians[0].parent.lastName}`.trim()
      : null,
    dueMinor: s.invoices.reduce((sum, i) => sum + i.balanceMinor, 0),
  }))
}

/** One student's counter view: who they are and every invoice still payable. */
export async function collectAccount(ctx: AppContext, studentId: string) {
  ctx.require('fees.collect')
  const s = await ctx.db.student.findFirst({
    where: { id: studentId, deletedAt: null },
    select: {
      id: true,
      admissionNo: true,
      firstName: true,
      lastName: true,
      enrollments: {
        where: { isCurrent: true },
        take: 1,
        select: { classLevel: { select: { name: true } }, section: { select: { name: true } } },
      },
      guardians: {
        orderBy: { isPrimary: 'desc' },
        take: 1,
        select: { parent: { select: { firstName: true, lastName: true } } },
      },
      invoices: {
        where: { status: { notIn: ['CANCELLED', 'DRAFT'] } },
        orderBy: [{ dueOn: 'asc' }, { number: 'asc' }],
        select: {
          id: true,
          number: true,
          title: true,
          dueOn: true,
          totalMinor: true,
          paidMinor: true,
          balanceMinor: true,
          status: true,
        },
      },
    },
  })
  if (!s) throw notFound('Student')
  return {
    student: {
      id: s.id,
      admissionNo: s.admissionNo,
      firstName: s.firstName,
      lastName: s.lastName,
      className: s.enrollments[0]?.classLevel.name ?? null,
      sectionName: s.enrollments[0]?.section.name ?? null,
      parentName: s.guardians[0]
        ? `${s.guardians[0].parent.firstName} ${s.guardians[0].parent.lastName}`.trim()
        : null,
      dueMinor: s.invoices.reduce((sum, i) => sum + Math.max(0, i.balanceMinor), 0),
    },
    invoices: s.invoices.map((i) => ({ ...i, dueOn: i.dueOn.toISOString() })),
  }
}

/** Fee heads offered as extra charges at the counter. */
export async function counterFeeHeads(ctx: AppContext) {
  ctx.require('fees.collect')
  return ctx.db.feeHead.findMany({
    where: { deletedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true },
  })
}

const BILL_BOOK_DIGITS = /^\d{1,12}$/

async function highestBillBookNo(tx: RawCapableClient, tenantId: string) {
  const rows = await tx.$queryRawUnsafe<{ value: string | null }[]>(
    `SELECT MAX(("billBookNo")::bigint)::text AS value
       FROM "FeePayment"
      WHERE "tenantId" = $1 AND "billBookNo" ~ '^[0-9]{1,12}$'`,
    tenantId,
  )
  return Number(rows[0]?.value ?? 0) || 0
}

/** The number the next counter collection will get. Display only. */
export async function peekNextBillBookNo(ctx: AppContext) {
  return String((await highestBillBookNo(ctx.db as unknown as RawCapableClient, ctx.tenant.id)) + 1)
}

/**
 * Issues the next bill book number inside the caller's transaction.
 *
 * The advisory lock serialises every collection in the school, so two counters
 * taking money at the same moment can never be handed the same number.
 */
export async function issueBillBookNo(tx: RawCapableClient, tenantId: string) {
  await tx.$queryRawUnsafe(
    'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))::text AS locked',
    `${tenantId}:BILL_BOOK`,
  )
  return String((await highestBillBookNo(tx, tenantId)) + 1)
}

/** Takes the same lock, then reports whether another collection already holds `value`. */
export async function billBookNoTaken(
  tx: RawCapableClient,
  tenantId: string,
  value: string,
  exceptCollection: { paymentIds: string[] },
) {
  await tx.$queryRawUnsafe(
    'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))::text AS locked',
    `${tenantId}:BILL_BOOK`,
  )
  const rows = await tx.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id FROM "FeePayment"
      WHERE "tenantId" = $1 AND "billBookNo" = $2
        AND NOT (id = ANY($3::text[]))
        AND status NOT IN ('REVERSED', 'FAILED', 'CANCELLED')
      LIMIT 1`,
    tenantId,
    value,
    exceptCollection.paymentIds,
  )
  return rows.length > 0
}

export function isNumericBillBookNo(value: string) {
  return BILL_BOOK_DIGITS.test(value)
}
