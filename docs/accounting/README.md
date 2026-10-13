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
