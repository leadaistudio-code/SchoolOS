-- Phase 7: lightweight BI analytics. Two new derived tables and one new index
-- on JournalEntry. No existing column, constraint or row is changed.

-- CreateTable
CREATE TABLE "LedgerMonthSummary" (
    "tenantId" TEXT NOT NULL,
    "month" DATE NOT NULL,
    "accountId" TEXT NOT NULL,
    "sourceType" "JournalSourceType" NOT NULL,
    "debitMinor" BIGINT NOT NULL DEFAULT 0,
    "creditMinor" BIGINT NOT NULL DEFAULT 0,
    "lineCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LedgerMonthSummary_pkey" PRIMARY KEY ("tenantId","month","accountId","sourceType")
);

-- CreateTable
CREATE TABLE "LedgerSummaryState" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "watermark" TIMESTAMP(3),
    "entryCount" INTEGER NOT NULL DEFAULT 0,
    "refreshedAt" TIMESTAMP(3) NOT NULL,
    "rebuiltAt" TIMESTAMP(3),
    "monthsRefreshed" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LedgerSummaryState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LedgerSummaryState_tenantId_key" ON "LedgerSummaryState"("tenantId");

-- CreateIndex
CREATE INDEX "LedgerMonthSummary_tenantId_accountId_month_idx" ON "LedgerMonthSummary"("tenantId", "accountId", "month");

-- CreateIndex: finds journal entries created since the last summary refresh.
CREATE INDEX "JournalEntry_tenantId_createdAt_idx" ON "JournalEntry"("tenantId", "createdAt");

-- Checks: totals are never negative, and a month is always its first day.
ALTER TABLE "LedgerMonthSummary"
  ADD CONSTRAINT "LedgerMonthSummary_amounts_check" CHECK ("debitMinor" >= 0 AND "creditMinor" >= 0 AND "lineCount" >= 0),
  ADD CONSTRAINT "LedgerMonthSummary_month_check" CHECK (EXTRACT(DAY FROM "month") = 1);

ALTER TABLE "LedgerSummaryState"
  ADD CONSTRAINT "LedgerSummaryState_counts_check" CHECK ("entryCount" >= 0 AND "monthsRefreshed" >= 0 AND "durationMs" >= 0);
