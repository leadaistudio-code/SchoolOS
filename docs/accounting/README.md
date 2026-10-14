# Accounting expansion

The accounting expansion builds on the existing double-entry ledger (`LedgerAccount`,
`JournalEntry`, `JournalLine`, posting engine in `src/server/modules/accounts/`). There is
one set of books; the new module adds controls around it, not a second ledger.

Code: `src/server/modules/accounting/`. Tests: `tests/accounting-foundation.test.ts`.

## Accounting policy (agreed)

- **Fees are recorded on a cash basis.** A fee receipt posts Dr Cash/Bank, Cr Fee income
  (per fee head). Raising an invoice posts nothing. The student statement of account is a
  read-only view over the fee module (invoices, payments, refunds, concessions,
  adjustments, credits), not a set of receivable vouchers.
- Money is stored as whole paise in INTEGER columns, as in the existing ledger. The
  largest single amount is ₹2,14,74,836.47.
- The financial year runs April to March by default (`fiscalYearStartMonth`), matching
  `financialYearRange` and receipt-book numbering.
- Posted vouchers are never edited; corrections post a reversal.
- A voucher must balance as entered. Nothing adds a balancing line.

## Switches

All default to off. A feature is on only when the deployment switch, the module switch
and the school's own setting (`AccountingSettings`) are all on. If the settings cannot be
read, every feature reports off and pages render as before.

| Environment variable | Purpose |
|---|---|
| `ACCOUNTING_MODULE_ENABLED` | Master switch for the whole expansion |
| `ACCOUNTING_STUDENT_LEDGER_ENABLED` | Student 360 Fees drilldown (phase 2) |
| `ACCOUNTING_APPROVALS_ENABLED` | Multi-tier expense approval (phase 6) |
| `WHATSAPP_RECEIPTS_ENABLED` | WhatsApp receipt notifications (phase 8) |

## Phase 1 database changes

Migration `prisma/migrations/20261013190000_accounting_foundation` creates, and changes
nothing that exists:

- enum `AccountingPeriodStatus`
- table `AccountingFiscalYear`: per-school years, lock date, close status
- table `AccountingAuditEvent`: append-only accounting trail, idempotent by `correlationId`
- table `AccountingSettings`: per-school switches
- CHECK constraints on year ranges, lock dates and the start month

No foreign keys to existing tables; all three tables are registered in
`src/server/db/tenant-models.ts` so every query is limited to the signed-in school.

## Rollback

Before the migration is applied anywhere: revert the phase 1 files
(`git revert <phase-1 commit>` or `git checkout b29afdf -- <files>`).

After it has been applied, the tables are unused by existing features, so rolling back
is safe once any data in them is no longer wanted:

```sql
DROP TABLE IF EXISTS "AccountingSettings";
DROP TABLE IF EXISTS "AccountingAuditEvent";
DROP TABLE IF EXISTS "AccountingFiscalYear";
DROP TYPE IF EXISTS "AccountingPeriodStatus";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261013190000_accounting_foundation';
```

Then revert the code. Take a database backup first (`npm run db:backup`).

## Phase 3: Sundry creditors (accounts payable)

Payables are on an **accrual basis**, unlike fees. Pages: `/accounts/vendors` and
`/accounts/vendors/[id]` (Vendor 360). APIs: `/api/v1/accounting/vendors`,
`purchase-vouchers`, `vendor-payments`, `debit-notes`, `vendor-adjustments`,
`payables/reconciliation`. Reading needs `accounts.view`; every write needs
`accounts.manage`. With the module switch off the APIs answer 403 `FEATURE_DISABLED` and
the pages show a notice.

Postings (all through the existing posting engine, one voucher each, idempotent):

| Document | Debit | Credit |
|---|---|---|
| Purchase voucher | each line's expense or asset account (incl. GST) | Sundry Creditors (2101) |
| Vendor payment | Sundry Creditors | Cash or Bank |
| Debit note (on approval) | Sundry Creditors | the original lines' accounts |
| Discount | Sundry Creditors | Discount Received (4010) |
| Write-off | Sundry Creditors | Creditors Written Back (4011) |

Cancelling a posted document posts a reversal; nothing is edited. The three accounts are
created for a school the first time it uses payables.

Figures on Vendor 360 (only POSTED vouchers and payments, APPROVED debit notes):

- Total invoiced = Σ voucher totals
- Total settled = Σ payments
- Total debit notes = Σ approved debit notes
- Net liability = invoiced − settled − debit notes − discounts and write-offs
- Bill outstanding = bill total − payments allocated to it − its debit notes − its adjustments
- On account = payments − allocations

Σ bill outstanding − on account = net liability; the page warns if that ever fails, and
`payables/reconciliation` compares the total with the Sundry Creditors ledger balance.

Controls: one supplier invoice number per vendor (case and punctuation ignored); a debit
note cannot return more than the remaining quantity or value of a line, nor more than the
bill's outstanding less other pending notes; with approvals on, a debit note waits for a
different user to approve it. Store items on purchase lines are a reference only and do
not move stock.

Migration `20261014010000_accounts_payable` adds eight new tables, four enums, CHECK
constraints and four new `JournalSourceType` values. No foreign keys to existing tables.

Rollback, after a backup:

```sql
DROP TABLE IF EXISTS "VendorAdjustment", "DebitNoteLine", "DebitNote",
  "VendorPaymentAllocation", "VendorPayment", "PurchaseVoucherLine", "PurchaseVoucher",
  "Vendor";
DROP TYPE IF EXISTS "PurchaseVoucherStatus", "VendorDocumentStatus", "DebitNoteStatus",
  "VendorAdjustmentType";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261014010000_accounts_payable';
```

Postgres cannot drop enum values, so the four `JournalSourceType` values stay; they are
harmless once unused. Journal entries already posted by payables must be reversed (or the
school's books restored) before the tables are dropped.

## Phase 4: Day Book (cash / bank register)

Page `/accounts/day-book`; APIs under `/api/v1/accounting/day-book` (register,
`reconciliation`, `repair`, `expenses`). Reading needs `accounts.view`, recording an expense
`expenses.manage`, re-posting `accounts.manage`. Off with the module switch.

The register is read from the journal, not from a second set of records: every entry that
touches a cash or bank ledger (the CASH and BANK system accounts plus any account a payment
mode is mapped to). Paid = credits to those ledgers, received = debits. Reversals are rows of
their own, so Σ paid and Σ received always equal the journal lines. The head summary spreads
each row's cash over the entry's other lines pro rata (payroll: only the net pay counts
against salary), so heads add up exactly to the register.

Reconciliation, per cash / bank ledger: opening balance + register in − register out must
equal the ledger's own closing balance, and the register's period totals must equal the
journal lines' totals. Expenses still post in the background as before; the page lists any
expense whose entry is missing, has a different amount, date or cash ledger, or was not
reversed after deletion, and "Re-post" re-runs the existing posting for them.

Recording from the Day Book uses the existing expense module (Dr expense head, Cr cash or
bank), checks the lock date, requires a reference for non-cash payments, posts immediately
and is retry-safe through an idempotency key. Supplier bills paid later go through Phase 3
purchase vouchers; advances and reimbursements use manual journals; all appear in the
register. Approval status arrives with Phase 6.

Migration `20261014120000_day_book` adds three nullable columns to `SchoolExpense`
(`voucherNumber`, `idempotencyKey`, `cashAccountId`) with two unique indexes. No foreign
keys, no data rewritten; older expenses keep NULL and show their journal number instead.

Rollback, after a backup:

```sql
DROP INDEX IF EXISTS "SchoolExpense_tenantId_voucherNumber_key";
DROP INDEX IF EXISTS "SchoolExpense_tenantId_idempotencyKey_key";
ALTER TABLE "SchoolExpense" DROP COLUMN IF EXISTS "voucherNumber",
  DROP COLUMN IF EXISTS "idempotencyKey", DROP COLUMN IF EXISTS "cashAccountId";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261014120000_day_book';
```

Revert the code at the same time: the expense module reads these columns.
