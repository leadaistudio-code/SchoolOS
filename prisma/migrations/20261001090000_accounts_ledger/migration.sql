-- CreateEnum
CREATE TYPE "LedgerAccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "JournalVoucherType" AS ENUM ('JOURNAL', 'RECEIPT', 'PAYMENT', 'CONTRA');

-- CreateEnum
CREATE TYPE "JournalSourceType" AS ENUM ('MANUAL', 'FEE_PAYMENT', 'FEE_REFUND', 'EXPENSE');

-- CreateEnum
CREATE TYPE "LedgerMapKind" AS ENUM ('FEE_HEAD', 'PAYMENT_MODE', 'EXPENSE_CATEGORY');

-- CreateTable
CREATE TABLE "LedgerAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "LedgerAccountType" NOT NULL,
    "description" TEXT,
    "openingBalanceMinor" INTEGER NOT NULL DEFAULT 0,
    "systemKey" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LedgerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "voucherType" "JournalVoucherType" NOT NULL DEFAULT 'JOURNAL',
    "date" DATE NOT NULL,
    "reference" TEXT,
    "narration" TEXT,
    "sourceType" "JournalSourceType" NOT NULL DEFAULT 'MANUAL',
    "sourceId" TEXT,
    "postingKey" TEXT,
    "totalMinor" INTEGER NOT NULL,
    "isReversal" BOOLEAN NOT NULL DEFAULT false,
    "reversalOfId" TEXT,
    "reversedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdByLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "debitMinor" INTEGER NOT NULL DEFAULT 0,
    "creditMinor" INTEGER NOT NULL DEFAULT 0,
    "memo" TEXT,

    CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerAccountMap" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" "LedgerMapKind" NOT NULL,
    "localKey" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LedgerAccountMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerSettings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "autoPostFees" BOOLEAN NOT NULL DEFAULT true,
    "autoPostExpenses" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LedgerSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LedgerAccount_tenantId_type_idx" ON "LedgerAccount"("tenantId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerAccount_tenantId_code_key" ON "LedgerAccount"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerAccount_tenantId_systemKey_key" ON "LedgerAccount"("tenantId", "systemKey");

-- CreateIndex
CREATE INDEX "JournalEntry_tenantId_date_idx" ON "JournalEntry"("tenantId", "date");

-- CreateIndex
CREATE INDEX "JournalEntry_tenantId_sourceType_sourceId_idx" ON "JournalEntry"("tenantId", "sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_tenantId_number_key" ON "JournalEntry"("tenantId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_tenantId_postingKey_key" ON "JournalEntry"("tenantId", "postingKey");

-- CreateIndex
CREATE INDEX "JournalLine_tenantId_accountId_idx" ON "JournalLine"("tenantId", "accountId");

-- CreateIndex
CREATE INDEX "JournalLine_entryId_idx" ON "JournalLine"("entryId");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerAccountMap_tenantId_kind_localKey_key" ON "LedgerAccountMap"("tenantId", "kind", "localKey");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerSettings_tenantId_key" ON "LedgerSettings"("tenantId");

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

