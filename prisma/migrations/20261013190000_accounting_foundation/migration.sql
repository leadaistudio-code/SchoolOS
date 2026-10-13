-- CreateEnum
CREATE TYPE "AccountingPeriodStatus" AS ENUM ('OPEN', 'LOCKED', 'CLOSED');

-- CreateTable
CREATE TABLE "AccountingFiscalYear" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "status" "AccountingPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "lockedThrough" DATE,
    "lockedById" TEXT,
    "lockedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingFiscalYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingAuditEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "action" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "reason" TEXT,
    "actorId" TEXT,
    "actorLabel" TEXT,
    "correlationId" TEXT,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingSettings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentLedgerEnabled" BOOLEAN NOT NULL DEFAULT false,
    "approvalWorkflowEnabled" BOOLEAN NOT NULL DEFAULT false,
    "whatsappReceiptsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "fiscalYearStartMonth" INTEGER NOT NULL DEFAULT 4,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountingFiscalYear_tenantId_startsOn_endsOn_idx" ON "AccountingFiscalYear"("tenantId", "startsOn", "endsOn");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingFiscalYear_tenantId_label_key" ON "AccountingFiscalYear"("tenantId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingFiscalYear_tenantId_startsOn_key" ON "AccountingFiscalYear"("tenantId", "startsOn");

-- CreateIndex
CREATE INDEX "AccountingAuditEvent_tenantId_entityType_entityId_idx" ON "AccountingAuditEvent"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "AccountingAuditEvent_tenantId_createdAt_idx" ON "AccountingAuditEvent"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingAuditEvent_tenantId_correlationId_key" ON "AccountingAuditEvent"("tenantId", "correlationId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingSettings_tenantId_key" ON "AccountingSettings"("tenantId");

-- Guards the application also enforces, kept in the database so a bad write cannot slip through.
ALTER TABLE "AccountingFiscalYear"
  ADD CONSTRAINT "AccountingFiscalYear_range_check" CHECK ("endsOn" > "startsOn"),
  ADD CONSTRAINT "AccountingFiscalYear_lock_in_range_check"
    CHECK ("lockedThrough" IS NULL OR ("lockedThrough" >= "startsOn" AND "lockedThrough" <= "endsOn"));

ALTER TABLE "AccountingSettings"
  ADD CONSTRAINT "AccountingSettings_fy_month_check" CHECK ("fiscalYearStartMonth" BETWEEN 1 AND 12);
