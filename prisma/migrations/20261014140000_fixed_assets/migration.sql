-- CreateEnum
CREATE TYPE "FixedAssetStatus" AS ENUM ('ACTIVE', 'DISPOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FixedAssetCapitalisation" AS ENUM ('EXISTING', 'POSTED');

-- CreateEnum
CREATE TYPE "DepreciationFrequency" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "DepreciationRunStatus" AS ENUM ('SUBMITTED', 'POSTED', 'REJECTED', 'REVERSED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "JournalSourceType" ADD VALUE 'DEPRECIATION';
ALTER TYPE "JournalSourceType" ADD VALUE 'FIXED_ASSET';

-- AlterTable
ALTER TABLE "AccountingSettings" ADD COLUMN     "depreciationFrequency" "DepreciationFrequency" NOT NULL DEFAULT 'YEARLY';

-- CreateTable
CREATE TABLE "FixedAsset" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "location" TEXT,
    "department" TEXT,
    "inventoryAssetId" TEXT,
    "capitalisedOn" DATE NOT NULL,
    "costMinor" INTEGER NOT NULL,
    "residualMinor" INTEGER NOT NULL,
    "usefulLifeMonths" INTEGER,
    "method" TEXT NOT NULL DEFAULT 'WDV',
    "rateBp" INTEGER NOT NULL,
    "depreciationStartOn" DATE NOT NULL,
    "openingAccumulatedMinor" INTEGER NOT NULL DEFAULT 0,
    "assetAccountId" TEXT NOT NULL,
    "capitalisation" "FixedAssetCapitalisation" NOT NULL DEFAULT 'EXISTING',
    "fundingAccountId" TEXT,
    "status" "FixedAssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "disposedOn" DATE,
    "disposalProceedsMinor" INTEGER,
    "disposalAccountId" TEXT,
    "disposalReason" TEXT,
    "disposalDepreciationMinor" INTEGER,
    "disposalGainLossMinor" INTEGER,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "notes" TEXT,
    "idempotencyKey" TEXT,
    "createdById" TEXT,
    "createdByLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FixedAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixedAssetRateChange" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "previousRateBp" INTEGER NOT NULL,
    "rateBp" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "changedById" TEXT,
    "changedByLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FixedAssetRateChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepreciationRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "frequency" "DepreciationFrequency" NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "periodKey" TEXT NOT NULL,
    "status" "DepreciationRunStatus" NOT NULL,
    "totalMinor" INTEGER NOT NULL,
    "idempotencyKey" TEXT,
    "createdById" TEXT,
    "createdByLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedById" TEXT,
    "approvedByLabel" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedById" TEXT,
    "rejectionReason" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3),
    "reversedById" TEXT,
    "reversalReason" TEXT,
    "reversedAt" TIMESTAMP(3),

    CONSTRAINT "DepreciationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepreciationLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "fromDate" DATE NOT NULL,
    "toDate" DATE NOT NULL,
    "fiscalYearLabel" TEXT NOT NULL,
    "fyOpeningWdvMinor" INTEGER NOT NULL,
    "chargeableDays" INTEGER NOT NULL,
    "rateBp" INTEGER NOT NULL,
    "openingWdvMinor" INTEGER NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "closingWdvMinor" INTEGER NOT NULL,
    "lifeEnd" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DepreciationLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FixedAsset_tenantId_status_idx" ON "FixedAsset"("tenantId", "status");

-- CreateIndex
CREATE INDEX "FixedAsset_tenantId_assetAccountId_idx" ON "FixedAsset"("tenantId", "assetAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "FixedAsset_tenantId_code_key" ON "FixedAsset"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "FixedAsset_tenantId_idempotencyKey_key" ON "FixedAsset"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "FixedAssetRateChange_tenantId_assetId_effectiveFrom_idx" ON "FixedAssetRateChange"("tenantId", "assetId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "DepreciationRun_tenantId_status_periodEnd_idx" ON "DepreciationRun"("tenantId", "status", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "DepreciationRun_tenantId_number_key" ON "DepreciationRun"("tenantId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "DepreciationRun_tenantId_periodKey_key" ON "DepreciationRun"("tenantId", "periodKey");

-- CreateIndex
CREATE UNIQUE INDEX "DepreciationRun_tenantId_idempotencyKey_key" ON "DepreciationRun"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "DepreciationLine_tenantId_assetId_toDate_idx" ON "DepreciationLine"("tenantId", "assetId", "toDate");

-- CreateIndex
CREATE INDEX "DepreciationLine_tenantId_runId_idx" ON "DepreciationLine"("tenantId", "runId");

-- AddForeignKey
ALTER TABLE "FixedAssetRateChange" ADD CONSTRAINT "FixedAssetRateChange_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "FixedAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepreciationLine" ADD CONSTRAINT "DepreciationLine_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DepreciationRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepreciationLine" ADD CONSTRAINT "DepreciationLine_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "FixedAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Guard rails the application also enforces.
ALTER TABLE "FixedAsset" ADD CONSTRAINT "FixedAsset_amounts_check" CHECK (
  "costMinor" > 0
  AND "residualMinor" >= 0 AND "residualMinor" <= "costMinor"
  AND "openingAccumulatedMinor" >= 0 AND "openingAccumulatedMinor" <= "costMinor" - "residualMinor"
  AND "rateBp" > 0 AND "rateBp" <= 10000
  AND ("usefulLifeMonths" IS NULL OR ("usefulLifeMonths" > 0 AND "usefulLifeMonths" <= 1200))
  AND "depreciationStartOn" >= "capitalisedOn"
  AND ("disposalProceedsMinor" IS NULL OR "disposalProceedsMinor" >= 0)
);
ALTER TABLE "FixedAssetRateChange" ADD CONSTRAINT "FixedAssetRateChange_rate_check" CHECK ("rateBp" > 0 AND "rateBp" <= 10000);
ALTER TABLE "DepreciationRun" ADD CONSTRAINT "DepreciationRun_period_check" CHECK ("periodEnd" >= "periodStart" AND "totalMinor" >= 0);
ALTER TABLE "DepreciationLine" ADD CONSTRAINT "DepreciationLine_amounts_check" CHECK (
  "toDate" >= "fromDate" AND "amountMinor" > 0 AND "closingWdvMinor" = "openingWdvMinor" - "amountMinor"
  AND "closingWdvMinor" >= 0 AND "chargeableDays" > 0
);

