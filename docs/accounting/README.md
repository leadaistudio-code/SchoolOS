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
| `WHATSAPP_RECEIPTS_DRY_RUN` | Production only: record WhatsApp receipts without sending (phase 8) |

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

## Phase 5: Fixed assets and WDV depreciation

Pages `/accounts/fixed-assets` (register, totals, register-vs-ledger check),
`/accounts/fixed-assets/[id]` (details, schedule, projection, rate history, journals) and
`/accounts/fixed-assets/depreciation` (preview, post / approve, runs, reversal). APIs under
`/api/v1/accounting/fixed-assets` (list / create, `[id]` get / edit / dispose / reverse
disposal / cancel, `depreciation` preview / create, `depreciation/[id]` approve / reject /
reverse, `reconciliation`, `settings`). Reading needs `accounts.view`, every change
`accounts.manage`. Off with the module switch. The register is new (`FixedAsset`); an
inventory item can be linked by id (no foreign key), and the inventory module is untouched.

Ledgers created on first use: 1500 Fixed Assets (at cost), 1590 Accumulated Depreciation
(asset, credit balance), 5020 Depreciation, 4013 Profit on Sale of Assets, 5021 Loss on
Sale / Scrapping of Assets. An asset can sit in any other asset ledger.

### Depreciation rule (written-down value)

- The rate is annual. Each financial year's charge is that year's opening WDV × rate ×
  days held in the year ÷ days in the year (365 or 366). A monthly run never applies the
  annual rate to a month; it charges the year-to-date share of the annual charge by days,
  so twelve monthly runs equal one yearly run to the paisa.
- Days count from the depreciation start date (default: capitalisation date) and, on
  disposal, include the disposal date.
- Rounding: half-up to the paisa on the cumulative year-to-date charge, minus what is
  already posted for that year, so partial periods never drift.
- Floor: depreciation never takes the WDV below the residual value (default 5% of cost,
  editable). With a useful life, the line ending on the last day of the life writes the WDV
  down to exactly the residual value. Without one, depreciation continues until the floor.
- Assets brought in mid-life carry depreciation brought forward; the first year starts from
  cost minus that amount.
- Rate changes are prospective: the new rate applies from the day after the last posted
  period, is recorded with a reason in `FixedAssetRateChange`, and posted lines are never
  recalculated. Residual value and useful life can also change; they only affect future
  periods (a residual above the current WDV, or a life that has already ended, simply stops
  further depreciation). Cost, dates and ledgers lock once anything is posted. Terms cannot
  change while the asset is in a run awaiting approval.

### Runs, duplicates and approvals

The school chooses monthly or yearly runs (`AccountingSettings.depreciationFrequency`,
default yearly). A run is for one period end (last day of a month or financial year), not
in the future and not in a locked period. Each asset continues from the day after its last
posted line, so a missed period is caught up and nothing is charged twice. Duplicates are
also blocked by a unique period key per active run, one pending run at a time and an
advisory lock. The preview shows every line before anything is posted.

With approvals off a run posts at once. With approvals on it waits as submitted until a
different manager approves it; approval recomputes the run and refuses if any asset has
changed. A rejected run is kept for audit and the period can be run again.

Posting per run: Dr Depreciation, Cr Accumulated Depreciation (one balanced journal,
sourced `DEPRECIATION`). A posted run can be reversed (only the latest for its assets and
none disposed since): the reversal is dated on the run's period end, so the register and
ledgers agree at every date, and the period can then be run again.

### Capitalisation and disposal

"Already in the books" records the asset only; its cost (and any brought-forward
depreciation) must already be in the ledgers through a purchase voucher, journal or
opening balance, or the reconciliation shows the difference. "Post now" posts Dr asset
ledger, Cr cash / bank / opening balance equity. An asset with no depreciation can be
cancelled; a posted capitalisation is reversed.

Disposal is one balanced entry: depreciation to the disposal date (Dr Depreciation,
Cr Accumulated Depreciation), then Dr Accumulated Depreciation (all of it), Dr cash / bank
(proceeds), Dr Loss or Cr Profit, Cr asset ledger at cost. It can be reversed. Disposal has
no maker-checker step in this phase.

### Reconciliation

As at any date: cost of assets held per asset ledger = that ledger's balance, and
brought-forward plus posted depreciation = the credit balance of Accumulated Depreciation.
Anything else posted to those ledgers shows as a difference.

### Database

Migration `20261014140000_fixed_assets` adds four enums, two `JournalSourceType` values,
`AccountingSettings.depreciationFrequency` (default `YEARLY`) and four new tables
(`FixedAsset`, `FixedAssetRateChange`, `DepreciationRun`, `DepreciationLine`) with CHECK
constraints on amounts, rates, dates and line arithmetic. Foreign keys only between the new
tables; no existing table gains one and no data is rewritten.

Rollback, after a backup and only if no fixed-asset journals need to stay (reverse them
first, or keep the journals and only revert the code):

```sql
DROP TABLE IF EXISTS "DepreciationLine";
DROP TABLE IF EXISTS "DepreciationRun";
DROP TABLE IF EXISTS "FixedAssetRateChange";
DROP TABLE IF EXISTS "FixedAsset";
ALTER TABLE "AccountingSettings" DROP COLUMN IF EXISTS "depreciationFrequency";
DROP TYPE IF EXISTS "DepreciationRunStatus";
DROP TYPE IF EXISTS "DepreciationFrequency";
DROP TYPE IF EXISTS "FixedAssetCapitalisation";
DROP TYPE IF EXISTS "FixedAssetStatus";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261014140000_fixed_assets';
```

Postgres cannot drop enum values, so `DEPRECIATION` and `FIXED_ASSET` stay in
`JournalSourceType`; they are harmless if unused. The ledgers created on first use are
ordinary accounts and can be deactivated.

## Phase 6: Multi-tier expense approval

"Trigger Multi-Tier Approval Workflow" is off by default. It needs
`ACCOUNTING_APPROVALS_ENABLED`, the accounting module and the school's switch
(`AccountingSettings.approvalWorkflowEnabled`, on the Expense approvals page for
`accounts.manage`). The same switch also drives the Phase 3 and 5 maker-checker steps.
While it is off, expenses are recorded and posted exactly as before.

While it is on, new expenses from the Expenses page and the Day Book become approval
requests (`ExpenseApprovalRequest`, numbered `EAR-…`), not `SchoolExpense` rows. Purchase
vouchers, vendor payments, debit notes and depreciation keep their own maker-checker.

| Stage | Status | Who | Permission |
| --- | --- | --- | --- |
| 1 Creator / draft | `DRAFT`, `RETURNED` | the preparer | `expenses.manage` |
| 2 Validator / audit | `SUBMITTED` | validator | `expense_approval.validate` |
| 3 Approver L1 | `PENDING_L1` | department head | `expense_approval.approve_department` |
| 4 Approver L2 | `PENDING_L2` | finance officer | `expense_approval.approve_finance` |
| 5 Final approver | `PENDING_FINAL` | principal | `expense_approval.approve_final` |

The default grants are as follows. School Admin gets all four permissions. Accountant gets
validate and finance. Principal gets department and final. Custom roles get none; grant
them in Roles. `npm run rbac:sync` (part of the Railway pre-deploy) adds the permissions and
re-grants the system roles.

### Rules

- **Moving forward:** each stage holder can approve, which passes the expense to the next
  stage.
- **Return:** the stage holder can return it to the creator; remarks are required. The
  creator edits it and resubmits. A resubmission starts a new cycle at stage 2, and earlier
  sign-offs no longer count.
- **Reject:** the stage holder can reject it; remarks are required. Rejection is final.
- **Withdraw:** the creator can withdraw it while it is a draft, returned, or not yet
  validated.
- **Separation of duties:** the creator cannot act at stages 2–5, and one person signs at
  most one stage per cycle. Returning or rejecting after signing an earlier stage is
  allowed.
- **Audit trail:** every transition and edit is an `ExpenseApprovalStep` recording the
  actor, time, remarks, previous status and new status. Requests are never deleted.
  Withdrawn, rejected and reversed requests stay for audit.
- **Concurrency:** each transition locks the request row (`FOR UPDATE`) and re-checks the
  rules against the locked state. The client sends the status it saw, so a double click
  or a second approver gets a 409 instead of approving twice.

### Posting

Pending requests never touch the general ledger, the expense register or the expense
dashboards.

Final approval runs in one transaction:

1. Checks the lock date.
2. Creates the `SchoolExpense` (EXP voucher number, with the preparer as recorder).
3. Posts its journal entry, Dr expense head and Cr cash / bank, under posting key
   `EXPENSE:<id>:v1`, so the nightly sync sees it as already posted.
4. Marks the request `POSTED` and records the step.

If any part fails, nothing is saved and the request stays at stage 5. There is no
"approved but not posted" state.

Final approval needs automatic expense posting (`LedgerSettings.autoPostExpenses`) on.

A posted expense is reversed from its request by a final approver, with remarks. This
removes the expense and posts a reversing entry dated today. Expenses created through
approval cannot be edited or deleted on the Expenses page.

The workflow cannot be switched off while requests are at stages 2–5. Drafts and returned
requests can be withdrawn afterwards.

### Provisional profit and loss

Profit & loss has an "Include provisional (under approval)" view next to the default
"Actuals only".

- **What it adds:** requests at stages 2–5 dated in the period. Each is counted once by
  request, mapped to its head's ledger and shown as a `[Provisional]` row with its stage.
- **What it leaves out:** drafts, returned, rejected, withdrawn, posted and reversed
  requests. Posted ones are already in the actuals.
- **What it shows:** actual income, actual expenses, provisional expenses, the projected
  net surplus or deficit, and the variance from actual. All of it is labelled as an
  estimate.
- **What it never does:** write to the ledgers.

### Database

Migration `20261014160000_expense_approvals` adds the `ExpenseApprovalStatus` enum and two
tables: `ExpenseApprovalRequest` and `ExpenseApprovalStep`.

- **Foreign keys:** only step → request. `SchoolExpense` gains no column or foreign key.
- **CHECK constraints:**
  - the amount is positive;
  - the cycle is at least 1;
  - `expenseId` and `postedAt` are set exactly when the status is posted or reversed;
  - `reversedAt` is set exactly when the status is reversed.
- **Apply it before deploying the code.** Expense edits and deletes look up this table.

Rollback, after a backup and with the workflow switched off and nothing in approval
(posted expenses stay as ordinary expenses):

```sql
DROP TABLE IF EXISTS "ExpenseApprovalStep";
DROP TABLE IF EXISTS "ExpenseApprovalRequest";
DROP TYPE IF EXISTS "ExpenseApprovalStatus";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261014160000_expense_approvals';
```

The four `expense_approval.*` permissions can be left in place; they grant nothing once
the code is reverted.

## Phase 7: Analytics

`/accounts/analytics` (needs `accounts.view` and the accounting module) shows four widgets
for a range of whole months. The default range is the financial year to date, and the
longest range is 36 months.

| Widget | Source | Basis |
| --- | --- | --- |
| Cash flow breakdown | monthly ledger summary | debits (in) and credits (out) on the CASH and BANK ledgers and any payment-mode ledger, grouped by journal source |
| Expense distribution | monthly ledger summary | net debit on each EXPENSE ledger; the total equals Profit & loss for the period |
| Dues aging | fee invoices, live | balance of open invoices by days past the due date: not yet due, 0–30, 31–60, 60+; needs `fees.accounts` |
| Fixed asset WDV | asset register, live | book value of assets held at each month end, after posted depreciation runs |

Cash-flow sources: fees, refunds, expenses, payroll, vendors (purchase vouchers, vendor
payments, debit notes, adjustments), store, fixed assets (including depreciation) and
manual journals. Reversal entries keep their original source, so they offset it.

### Drill-down audit pane

Every figure and chart element links to `?drill=<metric>:<key>`. The audit pane shows:

- the metric and the period;
- the formula, with what is included and what is excluded;
- the freshness time;
- the underlying journal lines, invoices or assets, 25 per page;
- a reconciliation table.

The reconciliation compares the summary figure against a live recomputation from the
journal. "Audit all" also checks the totals against these reports:

- **Cash flow:** closing cash against the ledger balance.
- **Expenses:** against Profit & loss.
- **Aging:** the overdue buckets against the fee dashboards' overdue total, and all buckets
  against all open invoices.
- **WDV:** the register against the ledger net block.

Drill-downs run through the same service checks as the page, so aging stays hidden
without `fees.accounts`. Every query is scoped to the school.

### Freshness and invalidation

These figures are **not real-time**, and the page says so.

Cash flow and expenses read `LedgerMonthSummary`. This table holds one row per school,
month, ledger and journal source, with debit and credit totals.

Each page load brings the summary up to date before reading it. Journal entries are
never edited or deleted (reversals are new entries), so new entries since the last
watermark show what changed:

- **Nothing new:** no work is done.
- **New entries:** only the months they are dated in are recomputed, so back-dated
  postings are included.
- **Entry count mismatch:** if the count is not the previous count plus the new entries,
  for example because an entry was removed outside the app, the whole summary is rebuilt.

The refresh runs under a per-school advisory lock. A second caller does not wait. If a
refresh is busy or fails, the page shows the last summary with a stale warning and the
time it was last brought up to date. `accounts.manage` users have a "Rebuild from
journal" button (`POST /api/v1/accounting/analytics/refresh`).

Aging and WDV are read live from their registers when the page loads.

### Performance

Measured locally with 25,000 journal entries and 50,000 lines in one school:

| Operation | Time |
| --- | --- |
| Full rebuild | 74 ms |
| One-month incremental refresh | 34 ms |
| Dashboard | 35 ms |
| Drill-down page 40 | 188 ms |

### Database

Migration `20261014180000_ledger_analytics` makes these changes:

- **New tables:** `LedgerMonthSummary` and `LedgerSummaryState`. Both are derived and
  safe to empty, and neither has a foreign key.
- **New indexes:** `LedgerMonthSummary(tenantId, accountId, month)` and
  `JournalEntry(tenantId, createdAt)`.
- **CHECK constraints:** totals are non-negative, and each month is stored as its first
  day.

No existing column or row changes.

Rollback:

```sql
DROP TABLE IF EXISTS "LedgerMonthSummary";
DROP TABLE IF EXISTS "LedgerSummaryState";
DROP INDEX IF EXISTS "JournalEntry_tenantId_createdAt_idx";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261014180000_ledger_analytics';
```

## Phase 8: WhatsApp fee receipts

When a fee payment is settled, the student's primary guardian gets a WhatsApp message
with the student's name, the amount, the receipt number, the payment date and a
"View receipt" link. If the primary guardian has no usable number, the first guardian
with one is used. A message is sent only if that number has recorded consent.

`/accounts/whatsapp-receipts` (needs `accounts.view` and the accounting module) has three
views:

- **Messages:** every queued, sent, failed and skipped message, with masked numbers.
- **Parent consent:** record a guardian's consent or opt-out.
- **Settings:** the school's provider, the delivery-status URL and the template to submit.

| Action | Permission |
| --- | --- |
| Provider settings, delivery-status URL | `settings.integrations` |
| Switch on or off, retry a message | `accounts.manage` |
| Record consent or opt-out | `fees.collect` |

The school switch can be turned on only when the deployment switch is on and the
provider settings are complete.

### Flow

1. A payment settles: a counter payment other than a cheque, a settled online payment,
   or a cleared cheque. After the payment commits, `afterPaymentChange` calls
   `queueFeeReceiptWhatsApp`, which never throws, so WhatsApp cannot fail a collection.
2. The service reads the payment from the database and requires it to be `SUCCESS` with
   a receipt. It never uses a status from the browser.
3. It writes one `WhatsAppOutbox` row, keyed `fee_receipt:<receiptId>`, and a `Job` in
   the same transaction. The unique key means a receipt gets at most one message, even
   when several callers queue it at once. If there is no consent, no usable number or no
   complete settings, the row is written as `SKIPPED` with the reason and no job.
4. The worker (`npm run worker`) claims the row and moves it from `QUEUED` to `SENDING`.
   It then checks the switch, payment, recipient, consent and settings again before
   calling the provider.
5. The outcome depends on the provider's response:
   - **Accepted:** the row becomes `SENT`, with the provider message id.
   - **Throttling, outage or network error:** the row becomes `FAILED` and is retried
     with the job queue's backoff. After 5 attempts it becomes `DEAD`.
   - **Rejected** (for example an unknown template or a bad token): the row becomes
     `DEAD` straight away.
6. If a row is found still `SENDING`, an earlier attempt stopped mid-call and WhatsApp
   may already have delivered it. It is marked `DEAD` with that explanation and is
   **never resent automatically**.
7. Staff can retry `FAILED`, `DEAD` and `SKIPPED` rows. Consent, the payment and the
   settings are checked again, and a sent message can never be retried.

The worker's maintenance pass also queues any receipt from the last 48 hours that has no
outbox row, for example because the server stopped right after the payment committed. It
only covers schools with the switch on, and only receipts issued after it was switched on.

Fee code calls one function, so changing provider is a settings change. Provider code is
in `src/server/modules/whatsapp-receipts/providers.ts`. The existing `WhatsAppProvider`
used by Communication is unchanged.

### No real messages outside production

A message goes to a provider only when `NODE_ENV=production`, the code is not running
under vitest, and `WHATSAPP_RECEIPTS_DRY_RUN` is off. Otherwise the dry-run provider
records the message as sent with a `dryrun_` id, and the page shows "Dry run". Tests use
mocked HTTP responses.

### Consent

Consent is recorded per phone number, with how it was given and when:

- **Staff:** "Signed form", "Told the office" or "Parent asked".
- **Replies:** a parent replying STOP (or unsubscribe or opt out) is opted out, and START
  opts back in.

Every change is audited with a masked number. An opt-out is checked again at send time,
so it also stops messages that are already queued.

### Receipt link

The link is `https://<school>/r/<token>`. The token is an HMAC signed with a key derived
from `AUTH_SECRET`, covering the school, the receipt and an expiry 7 days ahead. It needs
no login. The page:

- refuses tokens that are tampered, expired or from another school;
- refuses links when the payment is no longer `SUCCESS` (reversed, refunded or a bounced
  cheque), or the school has switched receipts off;
- shows only what the printed receipt shows: no outstanding balance, staff or contacts;
- is rate-limited per IP, marked `noindex`, and sends no referrer;
- logs every open as `fee_receipt.link_opened`.

Nothing is stored in object storage, so no storage URL is exposed.

### Provider setup

**Meta Cloud API.** You need the school's phone number id, a system-user access token
with `whatsapp_business_messaging`, and the app secret.

- **Template:** submit the template shown on the Settings page in the **Utility**
  category. Meta decides the category when it reviews it. If it is approved as Marketing,
  messages cost more and need marketing consent, so confirm the approved category before
  switching on.
- **Button:** a "Visit website" button with the dynamic URL `https://<school>/r/{{1}}`.
- **Webhook:** in the Meta app, set the delivery-status URL from the Settings page as the
  callback URL, and its last part as the verify token. Subscribe to `messages`. Every
  callback must carry a valid `X-Hub-Signature-256` from the app secret, or it is
  rejected with 403.

**AiSensy.** You need the API key and the live API campaign name. The campaign's
template takes the same four parameters plus a fifth, the full receipt link. Set the
delivery-status URL as the project webhook. AiSensy does not sign its callbacks, so the
secret in the URL is the proof. "New URL" replaces it at once.

**AiSensy caveat:** AiSensy does not publish its status-callback format or the message id
returned by the send API. The parser accepts Meta-style `statuses[]` and a flat
`{ messageId, status }`, and ignores anything else, answering 200 without changing a
row. Check this with a real AiSensy callback before going live.

Secrets are stored encrypted with `encryptSecret`, are never sent back to the browser, and
are never logged. Logs carry message ids and error codes only.

### Database

Migration `20261014200000_whatsapp_receipts` makes these changes:

- **New tables:** `WhatsAppReceiptConfig` (one row per school), `WhatsAppConsent` (unique
  per school and number) and `WhatsAppOutbox` (unique per school and event key). None has
  a foreign key.
- **New enums:** `WhatsAppReceiptProvider`, `WhatsAppConsentStatus` and
  `WhatsAppOutboxStatus`.
- **CHECK constraints:** consent timestamps match the status, attempts are non-negative,
  and sent states carry a sent time.

No existing column or row changes.

Rollback:

```sql
DROP TABLE IF EXISTS "WhatsAppOutbox";
DROP TABLE IF EXISTS "WhatsAppConsent";
DROP TABLE IF EXISTS "WhatsAppReceiptConfig";
DROP TYPE IF EXISTS "WhatsAppOutboxStatus";
DROP TYPE IF EXISTS "WhatsAppConsentStatus";
DROP TYPE IF EXISTS "WhatsAppReceiptProvider";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261014200000_whatsapp_receipts';
```

Jobs left in the `whatsapp` queue can be deleted with
`DELETE FROM "Job" WHERE "queue" = 'whatsapp';`.

## Phase 9: Release

### Navigation

The sidebar's Accounts & Ledger group gains Day Book, Vendors, Fixed assets, Expense
approvals and Analytics. They need `accounts.view` and show only while the school's
accounting module is on. WhatsApp receipts also needs `WHATSAPP_RECEIPTS_ENABLED`. When
the switches cannot be read, the links are hidden, so a school without the module sees
the sidebar it had before. Global search uses the same rules.

The in-page tabs on the existing accounts pages are unchanged.

### Integrity check

```
npx tsx scripts/accounting-integrity.ts            # every school
npx tsx scripts/accounting-integrity.ts --verbose  # with sample rows
```

It is read-only. It checks that:

- every voucher balances;
- lines and sources belong to the voucher's school;
- nothing was posted into a closed year or locked period after the lock;
- each source document has at most one posting in force;
- cancelled payments, unapproved expenses and unposted runs are not in the books;
- every reversal mirrors exactly one reversed voucher;
- the analytics summary equals the journal.

It exits 1 if a rule fails. Opening balances that do not net to zero, and settled
payments without a posting (automatic posting off, or not backfilled), are reported as
information only. The rules live in `src/server/modules/accounting/integrity.ts`.

### Deploying

Migrations, in order. All are additive: new tables and enums, CHECK constraints, no
foreign keys to existing tables, and no change to existing rows.

1. `20261013190000_accounting_foundation`
2. `20261014010000_accounts_payable`
3. `20261014120000_day_book`
4. `20261014140000_fixed_assets`
5. `20261014160000_expense_approvals`
6. `20261014180000_ledger_analytics`
7. `20261014200000_whatsapp_receipts`

Steps:

1. Take a backup (`npm run db:backup`).
2. Run `npx prisma migrate deploy` (never `migrate reset` or `db push`).
3. Deploy the code with every switch off. Nothing changes for any school.
4. Run the integrity check.
5. Switch on `ACCOUNTING_MODULE_ENABLED`, then enable features per school in Settings.
   The other switches are optional.
6. For WhatsApp receipts, also run `npm run worker`. Leave `WHATSAPP_RECEIPTS_DRY_RUN` on
   until the provider is verified.

### Rolling back

- **Switch off:** unset `ACCOUNTING_MODULE_ENABLED`. Every new page shows "not enabled",
  the new links disappear, and existing pages, Student 360 and fee collection behave as
  before. Posted vouchers stay in the books.
- **Code:** `git revert` the phase commits, newest first.
- **Database:** use the per-phase SQL above, newest phase first, after a backup. Drop
  tables only when their data is no longer wanted.

### Known limitations

- The AiSensy callback format is unverified (see Phase 8).
- Meta may not approve the template in the Utility category.
- Custom roles without `accounts.view` do not see the new links.
- Fee payments settled while automatic posting was off are not backfilled.
