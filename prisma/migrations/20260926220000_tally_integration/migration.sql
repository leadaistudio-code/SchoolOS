-- CreateEnum
CREATE TYPE "TallyProviderKind" AS ENUM ('ERP9', 'PRIME');

-- CreateEnum
CREATE TYPE "TallyConnectionMode" AS ENUM ('CONNECTOR', 'DIRECT');

-- CreateEnum
CREATE TYPE "TallyPartyModel" AS ENUM ('STUDENT_LEDGER', 'CLASS_LEDGER', 'FEE_CATEGORY_LEDGER', 'CUSTOM');

-- CreateEnum
CREATE TYPE "TallyConnectionHealth" AS ENUM ('UNKNOWN', 'HEALTHY', 'DEGRADED', 'OFFLINE', 'REQUIRES_ATTENTION');

-- CreateEnum
CREATE TYPE "TallyConnectorStatus" AS ENUM ('PENDING', 'ONLINE', 'OFFLINE', 'DISABLED', 'REVOKED');

-- CreateEnum
CREATE TYPE "TallyCommandType" AS ENUM ('TEST_CONNECTION', 'LIST_COMPANIES', 'FETCH_MASTERS', 'CREATE_LEDGER', 'CREATE_RECEIPT_VOUCHER', 'CREATE_PAYMENT_VOUCHER', 'FETCH_VOUCHERS', 'FETCH_BALANCES', 'RECONCILE');

-- CreateEnum
CREATE TYPE "TallyCommandStatus" AS ENUM ('PENDING', 'CLAIMED', 'SUCCEEDED', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "TallyMappingKind" AS ENUM ('FEE_HEAD', 'PAYMENT_MODE', 'STUDENT', 'EXPENSE_CATEGORY', 'VENDOR', 'COST_CENTRE', 'VOUCHER_TYPE', 'INCOME_LEDGER');

-- CreateEnum
CREATE TYPE "TallySyncStatus" AS ENUM ('PENDING', 'PROCESSING', 'SYNCED', 'FAILED', 'RETRYING', 'REQUIRES_REVIEW', 'SKIPPED');

-- CreateEnum
CREATE TYPE "TallyEntityKind" AS ENUM ('FEE_PAYMENT', 'FEE_RECEIPT', 'SCHOOL_EXPENSE', 'LEDGER', 'MASTER');

-- CreateEnum
CREATE TYPE "TallyReconStatus" AS ENUM ('MATCHED', 'UNMATCHED_MCV', 'UNMATCHED_TALLY', 'AMOUNT_MISMATCH', 'DATE_MISMATCH', 'LEDGER_MISMATCH', 'DUPLICATE', 'FAILED_SYNC', 'REVIEW');

-- CreateTable
CREATE TABLE "TallyIntegration" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "provider" "TallyProviderKind" NOT NULL DEFAULT 'ERP9',
    "mode" "TallyConnectionMode" NOT NULL DEFAULT 'CONNECTOR',
    "companyName" TEXT,
    "companyGuid" TEXT,
    "host" TEXT,
    "port" INTEGER NOT NULL DEFAULT 9000,
    "timeoutMs" INTEGER NOT NULL DEFAULT 15000,
    "syncFrequencyMin" INTEGER NOT NULL DEFAULT 15,
    "autoSyncReceipts" BOOLEAN NOT NULL DEFAULT true,
    "autoSyncExpenses" BOOLEAN NOT NULL DEFAULT false,
    "autoCreateLedgers" BOOLEAN NOT NULL DEFAULT false,
    "autoSyncMasters" BOOLEAN NOT NULL DEFAULT false,
    "testMode" BOOLEAN NOT NULL DEFAULT true,
    "partyModel" "TallyPartyModel" NOT NULL DEFAULT 'STUDENT_LEDGER',
    "health" "TallyConnectionHealth" NOT NULL DEFAULT 'UNKNOWN',
    "lastConnectionAt" TIMESTAMP(3),
    "lastConnectionError" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "lastMasterSyncAt" TIMESTAMP(3),
    "settingsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TallyIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TallyConnector" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "connectorKey" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "secretPrefix" TEXT NOT NULL,
    "status" "TallyConnectorStatus" NOT NULL DEFAULT 'PENDING',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "version" TEXT,
    "hostname" TEXT,
    "osInfo" TEXT,
    "tallyHost" TEXT NOT NULL DEFAULT '127.0.0.1',
    "tallyPort" INTEGER NOT NULL DEFAULT 9000,
    "pendingJobs" INTEGER NOT NULL DEFAULT 0,
    "lastSeenAt" TIMESTAMP(3),
    "pairedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TallyConnector_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TallyPairingCode" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "codeDisplay" TEXT NOT NULL,
    "connectorName" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "usedByConnectorId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TallyPairingCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TallyCommand" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "connectorId" TEXT,
    "type" "TallyCommandType" NOT NULL,
    "payload" JSONB,
    "status" "TallyCommandStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT,
    "resultJson" JSONB,
    "error" TEXT,
    "errorCode" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "TallyCommand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TallyLedgerCache" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parent" TEXT,
    "guid" TEXT,
    "isParty" BOOLEAN NOT NULL DEFAULT false,
    "isRevenue" BOOLEAN NOT NULL DEFAULT false,
    "closingBalanceMinor" INTEGER,
    "rawJson" JSONB,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TallyLedgerCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TallyMapping" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "kind" "TallyMappingKind" NOT NULL,
    "localKey" TEXT NOT NULL,
    "localLabel" TEXT,
    "tallyLedgerName" TEXT NOT NULL,
    "tallyGuid" TEXT,
    "tallyParent" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "autoMatched" BOOLEAN NOT NULL DEFAULT false,
    "matchScore" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TallyMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TallyVoucherLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "entityKind" "TallyEntityKind" NOT NULL,
    "entityId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "TallySyncStatus" NOT NULL DEFAULT 'PENDING',
    "voucherType" TEXT,
    "tallyVoucherNumber" TEXT,
    "tallyMasterId" TEXT,
    "amountMinor" INTEGER,
    "voucherDate" DATE,
    "previewJson" JSONB,
    "lastError" TEXT,
    "lastErrorCode" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TallyVoucherLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TallyAccountingRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "paymentMode" "PaymentMode",
    "feeHeadId" TEXT,
    "debitLedgerName" TEXT NOT NULL,
    "creditLedgerName" TEXT,
    "voucherType" TEXT NOT NULL DEFAULT 'Receipt',
    "narrationTemplate" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TallyAccountingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TallySyncLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "userId" TEXT,
    "operation" TEXT NOT NULL,
    "entityKind" TEXT,
    "entityId" TEXT,
    "correlationId" TEXT NOT NULL,
    "status" "TallySyncStatus" NOT NULL,
    "httpStatus" INTEGER,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "detailJson" JSONB,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TallySyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TallyReconciliationItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "status" "TallyReconStatus" NOT NULL,
    "mcvEntityKind" "TallyEntityKind",
    "mcvEntityId" TEXT,
    "mcvAmountMinor" INTEGER,
    "mcvDate" DATE,
    "tallyVoucherNo" TEXT,
    "tallyAmountMinor" INTEGER,
    "tallyDate" DATE,
    "notes" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TallyReconciliationItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TallyIntegration_tenantId_key" ON "TallyIntegration"("tenantId");

-- CreateIndex
CREATE INDEX "TallyIntegration_enabled_health_idx" ON "TallyIntegration"("enabled", "health");

-- CreateIndex
CREATE UNIQUE INDEX "TallyConnector_connectorKey_key" ON "TallyConnector"("connectorKey");

-- CreateIndex
CREATE INDEX "TallyConnector_tenantId_status_idx" ON "TallyConnector"("tenantId", "status");

-- CreateIndex
CREATE INDEX "TallyConnector_tenantId_lastSeenAt_idx" ON "TallyConnector"("tenantId", "lastSeenAt");

-- CreateIndex
CREATE INDEX "TallyConnector_integrationId_idx" ON "TallyConnector"("integrationId");

-- CreateIndex
CREATE UNIQUE INDEX "TallyPairingCode_codeHash_key" ON "TallyPairingCode"("codeHash");

-- CreateIndex
CREATE INDEX "TallyPairingCode_tenantId_expiresAt_idx" ON "TallyPairingCode"("tenantId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "TallyCommand_tenantId_idempotencyKey_key" ON "TallyCommand"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "TallyCommand_tenantId_status_runAfter_idx" ON "TallyCommand"("tenantId", "status", "runAfter");

-- CreateIndex
CREATE INDEX "TallyCommand_connectorId_status_createdAt_idx" ON "TallyCommand"("connectorId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "TallyCommand_integrationId_type_status_idx" ON "TallyCommand"("integrationId", "type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TallyLedgerCache_tenantId_integrationId_name_key" ON "TallyLedgerCache"("tenantId", "integrationId", "name");

-- CreateIndex
CREATE INDEX "TallyLedgerCache_tenantId_parent_idx" ON "TallyLedgerCache"("tenantId", "parent");

-- CreateIndex
CREATE INDEX "TallyLedgerCache_integrationId_isParty_idx" ON "TallyLedgerCache"("integrationId", "isParty");

-- CreateIndex
CREATE UNIQUE INDEX "TallyMapping_tenantId_integrationId_kind_localKey_key" ON "TallyMapping"("tenantId", "integrationId", "kind", "localKey");

-- CreateIndex
CREATE INDEX "TallyMapping_tenantId_kind_active_idx" ON "TallyMapping"("tenantId", "kind", "active");

-- CreateIndex
CREATE UNIQUE INDEX "TallyVoucherLink_tenantId_idempotencyKey_key" ON "TallyVoucherLink"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "TallyVoucherLink_tenantId_entityKind_entityId_key" ON "TallyVoucherLink"("tenantId", "entityKind", "entityId");

-- CreateIndex
CREATE INDEX "TallyVoucherLink_tenantId_status_idx" ON "TallyVoucherLink"("tenantId", "status");

-- CreateIndex
CREATE INDEX "TallyVoucherLink_integrationId_status_updatedAt_idx" ON "TallyVoucherLink"("integrationId", "status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TallyAccountingRule_tenantId_integrationId_name_key" ON "TallyAccountingRule"("tenantId", "integrationId", "name");

-- CreateIndex
CREATE INDEX "TallyAccountingRule_tenantId_paymentMode_active_idx" ON "TallyAccountingRule"("tenantId", "paymentMode", "active");

-- CreateIndex
CREATE INDEX "TallySyncLog_tenantId_createdAt_idx" ON "TallySyncLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "TallySyncLog_integrationId_status_createdAt_idx" ON "TallySyncLog"("integrationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "TallySyncLog_correlationId_idx" ON "TallySyncLog"("correlationId");

-- CreateIndex
CREATE INDEX "TallyReconciliationItem_tenantId_runId_status_idx" ON "TallyReconciliationItem"("tenantId", "runId", "status");

-- CreateIndex
CREATE INDEX "TallyReconciliationItem_integrationId_status_idx" ON "TallyReconciliationItem"("integrationId", "status");

-- AddForeignKey
ALTER TABLE "TallyConnector" ADD CONSTRAINT "TallyConnector_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "TallyIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TallyCommand" ADD CONSTRAINT "TallyCommand_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "TallyIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TallyCommand" ADD CONSTRAINT "TallyCommand_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "TallyConnector"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TallyLedgerCache" ADD CONSTRAINT "TallyLedgerCache_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "TallyIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TallyMapping" ADD CONSTRAINT "TallyMapping_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "TallyIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TallyVoucherLink" ADD CONSTRAINT "TallyVoucherLink_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "TallyIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TallyAccountingRule" ADD CONSTRAINT "TallyAccountingRule_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "TallyIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TallySyncLog" ADD CONSTRAINT "TallySyncLog_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "TallyIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TallyReconciliationItem" ADD CONSTRAINT "TallyReconciliationItem_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "TallyIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
