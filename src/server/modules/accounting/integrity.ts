import { Prisma, type PrismaClient } from '@prisma/client'

/**
 * Read-only accounting integrity checks across every school, run by
 * `scripts/accounting-integrity.ts`. A "rule" finding means the books are
 * wrong; an "info" finding is reported but may be legitimate.
 */

export type IntegrityRow = { tenantId: string; id: string; detail?: string | null }
export type IntegrityCheck = { name: string; kind: 'rule' | 'info'; sql: Prisma.Sql }
export type IntegrityResult = { name: string; kind: 'rule' | 'info'; rows: IntegrityRow[] }

/** Entries still in force: not a reversal, not reversed. */
const ACTIVE = Prisma.sql`e."isReversal" = false AND e."reversedAt" IS NULL`

export const INTEGRITY_CHECKS: IntegrityCheck[] = [
  // 1. Every voucher is balanced and has at least two lines.
  {
    name: 'Voucher debits equal credits and the voucher total, with 2+ lines',
    kind: 'rule',
    sql: Prisma.sql`
      SELECT e."tenantId", e."id", e."number" || ': Dr ' || COALESCE(SUM(l."debitMinor"), 0) || ' Cr ' || COALESCE(SUM(l."creditMinor"), 0) || ' total ' || e."totalMinor" || ' lines ' || COUNT(l."id") AS detail
      FROM "JournalEntry" e LEFT JOIN "JournalLine" l ON l."entryId" = e."id"
      GROUP BY e."id"
      HAVING COALESCE(SUM(l."debitMinor"), 0) <> COALESCE(SUM(l."creditMinor"), 0)
          OR COALESCE(SUM(l."debitMinor"), 0) <> e."totalMinor"
          OR COUNT(l."id") < 2`,
  },
  {
    name: 'Each line is one-sided and non-negative',
    kind: 'rule',
    sql: Prisma.sql`
      SELECT l."tenantId", l."id", 'Dr ' || l."debitMinor" || ' Cr ' || l."creditMinor" AS detail
      FROM "JournalLine" l
      WHERE l."debitMinor" < 0 OR l."creditMinor" < 0
         OR (l."debitMinor" > 0 AND l."creditMinor" > 0)
         OR (l."debitMinor" = 0 AND l."creditMinor" = 0)`,
  },
  // 2 and 3. Lines point at an account of the same school as the voucher.
  {
    name: 'Lines reference an account of the same school as their voucher',
    kind: 'rule',
    sql: Prisma.sql`
      SELECT l."tenantId", l."id", 'entry ' || e."tenantId" || ' account ' || COALESCE(a."tenantId", 'missing') AS detail
      FROM "JournalLine" l
      JOIN "JournalEntry" e ON e."id" = l."entryId"
      LEFT JOIN "LedgerAccount" a ON a."id" = l."accountId"
      WHERE a."id" IS NULL OR a."tenantId" <> l."tenantId" OR e."tenantId" <> l."tenantId"`,
  },
  {
    name: 'Automatic postings belong to the same school as their source document',
    kind: 'rule',
    sql: Prisma.sql`
      SELECT e."tenantId", e."id", e."sourceType"::text || ' ' || e."sourceId" AS detail
      FROM "JournalEntry" e
      LEFT JOIN "FeePayment" p ON e."sourceType" = 'FEE_PAYMENT' AND p."id" = e."sourceId"
      LEFT JOIN "FeeRefund" r ON e."sourceType" = 'FEE_REFUND' AND r."id" = e."sourceId"
      LEFT JOIN "SchoolExpense" x ON e."sourceType" = 'EXPENSE' AND x."id" = e."sourceId"
      LEFT JOIN "PurchaseVoucher" pv ON e."sourceType" = 'PURCHASE_VOUCHER' AND pv."id" = e."sourceId"
      LEFT JOIN "VendorPayment" vp ON e."sourceType" = 'VENDOR_PAYMENT' AND vp."id" = e."sourceId"
      LEFT JOIN "DebitNote" dn ON e."sourceType" = 'DEBIT_NOTE' AND dn."id" = e."sourceId"
      LEFT JOIN "VendorAdjustment" va ON e."sourceType" = 'VENDOR_ADJUSTMENT' AND va."id" = e."sourceId"
      LEFT JOIN "FixedAsset" fa ON e."sourceType" = 'FIXED_ASSET' AND fa."id" = e."sourceId"
      LEFT JOIN "DepreciationRun" dr ON e."sourceType" = 'DEPRECIATION' AND dr."id" = e."sourceId"
      WHERE e."sourceId" IS NOT NULL AND COALESCE(p."tenantId", r."tenantId", x."tenantId", pv."tenantId", vp."tenantId", dn."tenantId", va."tenantId", fa."tenantId", dr."tenantId") <> e."tenantId"`,
  },
  // 4. Nothing was posted into a year after it was closed.
  {
    name: 'No voucher was created in a financial year after it was closed',
    kind: 'rule',
    sql: Prisma.sql`
      SELECT e."tenantId", e."id", e."number" || ' dated ' || e."date"::text || ' in ' || y."label" AS detail
      FROM "JournalEntry" e
      JOIN "AccountingFiscalYear" y ON y."tenantId" = e."tenantId" AND e."date" BETWEEN y."startsOn" AND y."endsOn"
      WHERE y."status" = 'CLOSED' AND y."closedAt" IS NOT NULL AND e."createdAt" > y."closedAt"`,
  },
  {
    name: 'No voucher was created inside a locked period after it was locked',
    kind: 'rule',
    sql: Prisma.sql`
      SELECT e."tenantId", e."id", e."number" || ' dated ' || e."date"::text || ', locked through ' || y."lockedThrough"::text AS detail
      FROM "JournalEntry" e
      JOIN "AccountingFiscalYear" y ON y."tenantId" = e."tenantId" AND e."date" BETWEEN y."startsOn" AND y."endsOn"
      WHERE y."lockedThrough" IS NOT NULL AND y."lockedAt" IS NOT NULL AND e."date" <= y."lockedThrough" AND e."createdAt" > y."lockedAt"`,
  },
  // 5. Each source document is counted once.
  {
    name: 'Each source document has at most one posting in force',
    kind: 'rule',
    sql: Prisma.sql`
      SELECT e."tenantId", MIN(e."id") AS id, e."sourceType"::text || ' ' || e."sourceId" || ' x' || COUNT(*) AS detail
      FROM "JournalEntry" e
      WHERE ${ACTIVE} AND e."sourceType" NOT IN ('MANUAL', 'FIXED_ASSET') AND e."sourceId" IS NOT NULL
      GROUP BY e."tenantId", e."sourceType", e."sourceId"
      HAVING COUNT(*) > 1
      UNION ALL
      SELECT e."tenantId", MIN(e."id"), 'FIXED_ASSET ' || e."sourceId" || ' ' || split_part(e."postingKey", ':', 3) || ' x' || COUNT(*)
      FROM "JournalEntry" e
      WHERE ${ACTIVE} AND e."sourceType" = 'FIXED_ASSET'
      GROUP BY e."tenantId", e."sourceId", split_part(e."postingKey", ':', 3)
      HAVING COUNT(*) > 1`,
  },
  {
    name: 'Cancelled, failed or reversed fee payments have no posting in force',
    kind: 'rule',
    sql: Prisma.sql`
      SELECT e."tenantId", e."id", 'payment ' || p."id" || ' is ' || p."status"::text AS detail
      FROM "JournalEntry" e JOIN "FeePayment" p ON p."id" = e."sourceId"
      WHERE e."sourceType" = 'FEE_PAYMENT' AND ${ACTIVE} AND p."status" IN ('REVERSED', 'CANCELLED', 'FAILED', 'INITIATED')`,
  },
  {
    name: 'Supplier documents are in the books only while posted or approved',
    kind: 'rule',
    sql: Prisma.sql`
      SELECT e."tenantId", e."id", e."sourceType"::text || ' ' || e."sourceId" || ' is ' || COALESCE(pv."status"::text, vp."status"::text, dn."status"::text, va."status"::text, 'missing') AS detail
      FROM "JournalEntry" e
      LEFT JOIN "PurchaseVoucher" pv ON e."sourceType" = 'PURCHASE_VOUCHER' AND pv."id" = e."sourceId"
      LEFT JOIN "VendorPayment" vp ON e."sourceType" = 'VENDOR_PAYMENT' AND vp."id" = e."sourceId"
      LEFT JOIN "DebitNote" dn ON e."sourceType" = 'DEBIT_NOTE' AND dn."id" = e."sourceId"
      LEFT JOIN "VendorAdjustment" va ON e."sourceType" = 'VENDOR_ADJUSTMENT' AND va."id" = e."sourceId"
      WHERE ${ACTIVE} AND e."sourceType" IN ('PURCHASE_VOUCHER', 'VENDOR_PAYMENT', 'DEBIT_NOTE', 'VENDOR_ADJUSTMENT')
        AND NOT (pv."status" = 'POSTED' OR vp."status" = 'POSTED' OR dn."status" = 'APPROVED' OR va."status" = 'POSTED')`,
  },
  {
    name: 'Posted purchase vouchers are in the books',
    kind: 'rule',
    sql: Prisma.sql`
      SELECT pv."tenantId", pv."id", pv."number" AS detail
      FROM "PurchaseVoucher" pv
      WHERE pv."status" = 'POSTED' AND NOT EXISTS (
        SELECT 1 FROM "JournalEntry" e WHERE e."tenantId" = pv."tenantId" AND e."sourceType" = 'PURCHASE_VOUCHER' AND e."sourceId" = pv."id" AND ${ACTIVE})`,
  },
  {
    name: 'Depreciation is in the books only for posted runs',
    kind: 'rule',
    sql: Prisma.sql`
      SELECT e."tenantId", e."id", 'run ' || e."sourceId" || ' is ' || COALESCE(dr."status"::text, 'missing') AS detail
      FROM "JournalEntry" e LEFT JOIN "DepreciationRun" dr ON dr."id" = e."sourceId"
      WHERE e."sourceType" = 'DEPRECIATION' AND ${ACTIVE} AND COALESCE(dr."status"::text, '') <> 'POSTED'`,
  },
  {
    name: 'Expense postings point at an existing expense',
    kind: 'rule',
    sql: Prisma.sql`
      SELECT e."tenantId", e."id", 'expense ' || e."sourceId" AS detail
      FROM "JournalEntry" e LEFT JOIN "SchoolExpense" x ON x."id" = e."sourceId"
      WHERE e."sourceType" = 'EXPENSE' AND ${ACTIVE} AND x."id" IS NULL`,
  },
  // 8. Actual books exclude expense requests that are not finally approved.
  {
    name: 'Unapproved expense requests have no expense and no posting',
    kind: 'rule',
    sql: Prisma.sql`
      SELECT r."tenantId", r."id", r."number" || ' is ' || r."status"::text AS detail
      FROM "ExpenseApprovalRequest" r
      WHERE r."status" <> 'POSTED' AND r."expenseId" IS NOT NULL AND EXISTS (
        SELECT 1 FROM "JournalEntry" e WHERE e."tenantId" = r."tenantId" AND e."sourceType" = 'EXPENSE' AND e."sourceId" = r."expenseId" AND ${ACTIVE})`,
  },
  {
    name: 'Each expense request posted at most one expense',
    kind: 'rule',
    sql: Prisma.sql`
      SELECT r."tenantId", MIN(r."id") AS id, 'expense ' || r."expenseId" || ' used by ' || COUNT(*) || ' requests' AS detail
      FROM "ExpenseApprovalRequest" r WHERE r."expenseId" IS NOT NULL
      GROUP BY r."tenantId", r."expenseId" HAVING COUNT(*) > 1`,
  },
  // 7. Corrections are reversals that mirror the original.
  {
    name: 'Every reversed voucher has exactly one reversal, and every reversal points at a reversed voucher',
    kind: 'rule',
    sql: Prisma.sql`
      SELECT e."tenantId", e."id", e."number" || ' reversed with ' || COUNT(r."id") || ' reversals' AS detail
      FROM "JournalEntry" e LEFT JOIN "JournalEntry" r ON r."reversalOfId" = e."id" AND r."isReversal" = true
      WHERE e."reversedAt" IS NOT NULL
      GROUP BY e."id" HAVING COUNT(r."id") <> 1
      UNION ALL
      SELECT r."tenantId", r."id", r."number" || ' reverses ' || COALESCE(r."reversalOfId", 'nothing')
      FROM "JournalEntry" r LEFT JOIN "JournalEntry" o ON o."id" = r."reversalOfId"
      WHERE r."isReversal" = true AND (o."id" IS NULL OR o."reversedAt" IS NULL OR o."tenantId" <> r."tenantId")`,
  },
  {
    name: 'Each reversal mirrors its original line for line',
    kind: 'rule',
    sql: Prisma.sql`
      WITH o AS (
        SELECT r."id" AS rid, l."accountId", SUM(l."debitMinor") AS dr, SUM(l."creditMinor") AS cr
        FROM "JournalEntry" r JOIN "JournalLine" l ON l."entryId" = r."reversalOfId"
        WHERE r."isReversal" = true GROUP BY r."id", l."accountId"),
      v AS (
        SELECT r."id" AS rid, l."accountId", SUM(l."debitMinor") AS dr, SUM(l."creditMinor") AS cr
        FROM "JournalEntry" r JOIN "JournalLine" l ON l."entryId" = r."id"
        WHERE r."isReversal" = true GROUP BY r."id", l."accountId")
      SELECT r."tenantId", r."id", r."number" AS detail
      FROM "JournalEntry" r
      WHERE r."isReversal" = true AND EXISTS (
        SELECT 1 FROM o FULL JOIN v ON v."rid" = o."rid" AND v."accountId" = o."accountId"
        WHERE COALESCE(o."rid", v."rid") = r."id" AND (COALESCE(o."dr", 0) <> COALESCE(v."cr", 0) OR COALESCE(o."cr", 0) <> COALESCE(v."dr", 0)))`,
  },
  // Phase 7: the analytics summary agrees with the journal it summarises.
  {
    name: 'Analytics month summary equals the journal (schools with a summary)',
    kind: 'rule',
    sql: Prisma.sql`
      WITH live AS (
        SELECT e."tenantId", date_trunc('month', e."date")::date AS month, l."accountId", e."sourceType",
               SUM(l."debitMinor")::bigint AS dr, SUM(l."creditMinor")::bigint AS cr
        FROM "JournalEntry" e JOIN "JournalLine" l ON l."entryId" = e."id"
        WHERE e."tenantId" IN (SELECT "tenantId" FROM "LedgerSummaryState")
        GROUP BY 1, 2, 3, 4),
      summ AS (SELECT "tenantId", "month", "accountId", "sourceType", "debitMinor" AS dr, "creditMinor" AS cr FROM "LedgerMonthSummary")
      SELECT COALESCE(live."tenantId", summ."tenantId") AS "tenantId", COALESCE(live."accountId", summ."accountId") AS id,
             COALESCE(live."month", summ."month")::text || ' ' || COALESCE(live."sourceType", summ."sourceType")::text AS detail
      FROM live FULL JOIN summ ON summ."tenantId" = live."tenantId" AND summ."month" = live."month" AND summ."accountId" = live."accountId" AND summ."sourceType" = live."sourceType"
      WHERE COALESCE(live.dr, 0) <> COALESCE(summ.dr, 0) OR COALESCE(live.cr, 0) <> COALESCE(summ.cr, 0)`,
  },
  // 6. Opening balances: reported, since a school may still be entering them.
  {
    name: 'Opening balances that do not net to zero (difference in opening balance)',
    kind: 'info',
    sql: Prisma.sql`
      SELECT a."tenantId", a."tenantId" AS id, 'net opening ' || SUM(a."openingBalanceMinor") AS detail
      FROM "LedgerAccount" a GROUP BY a."tenantId" HAVING SUM(a."openingBalanceMinor") <> 0`,
  },
  {
    name: 'Settled fee payments with no posting in force (automatic posting off, or not yet backfilled)',
    kind: 'info',
    sql: Prisma.sql`
      SELECT p."tenantId", p."id", p."status"::text AS detail
      FROM "FeePayment" p
      WHERE p."status" = 'SUCCESS' AND NOT EXISTS (
        SELECT 1 FROM "JournalEntry" e WHERE e."tenantId" = p."tenantId" AND e."sourceType" = 'FEE_PAYMENT' AND e."sourceId" = p."id" AND ${ACTIVE})`,
  },
]

export async function runIntegrityChecks(client: PrismaClient): Promise<IntegrityResult[]> {
  const results: IntegrityResult[] = []
  for (const check of INTEGRITY_CHECKS) {
    results.push({ name: check.name, kind: check.kind, rows: await client.$queryRaw<IntegrityRow[]>(check.sql) })
  }
  return results
}
