-- Fees & Collections simplicity architecture.
-- Additive only: existing structures, invoices, payments, receipts and refunds remain untouched.

ALTER TYPE "FeeFrequency" ADD VALUE IF NOT EXISTS 'TERM_WISE';
ALTER TYPE "FeeFrequency" ADD VALUE IF NOT EXISTS 'CUSTOM';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'REVERSED';

CREATE TYPE "FeeStructureStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "FeeAssignmentStatus" AS ENUM ('ACTIVE', 'ENDED');
CREATE TYPE "FeeCreditEntryType" AS ENUM ('CREDIT', 'APPLIED', 'REFUND', 'ADJUSTMENT', 'REVERSAL');
CREATE TYPE "FeeAdjustmentType" AS ENUM ('CHARGE', 'CREDIT', 'REVERSAL');
CREATE TYPE "FeeReminderOffsetType" AS ENUM ('BEFORE_DUE', 'ON_DUE', 'AFTER_DUE');

ALTER TABLE "FeeStructure"
  ADD COLUMN "status" "FeeStructureStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "publishedAt" TIMESTAMP(3),
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Structures that already produced invoices are production structures, not drafts.
UPDATE "FeeStructure" s
SET "status" = 'PUBLISHED', "publishedAt" = COALESCE(s."createdAt", CURRENT_TIMESTAMP)
WHERE EXISTS (SELECT 1 FROM "FeeInvoice" i WHERE i."structureId" = s."id");

ALTER TABLE "FeeStructureItem"
  ADD COLUMN "unitAmountMinor" INTEGER,
  ADD COLUMN "frequency" "FeeFrequency",
  ADD COLUMN "occurrenceCount" INTEGER;


CREATE TABLE "FeeInstallment" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "structureId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "dueOn" DATE NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FeeInstallment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FeeInstallmentLine" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "installmentId" TEXT NOT NULL,
  "feeHeadId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  CONSTRAINT "FeeInstallmentLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudentFeeAssignment" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "structureId" TEXT NOT NULL,
  "status" "FeeAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  "assignedById" TEXT,
  "notes" TEXT,
  CONSTRAINT "StudentFeeAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudentFeeCredit" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "type" "FeeCreditEntryType" NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  "paymentId" TEXT,
  "invoiceId" TEXT,
  "reference" TEXT,
  "notes" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudentFeeCredit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FeeAdjustment" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "invoiceId" TEXT,
  "type" "FeeAdjustmentType" NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "reversedAdjustmentId" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FeeAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FeeReminderRule" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "offsetType" "FeeReminderOffsetType" NOT NULL,
  "offsetDays" INTEGER NOT NULL DEFAULT 0,
  "channels" JSONB NOT NULL,
  "templateKey" TEXT NOT NULL DEFAULT 'fee.due',
  "maxSends" INTEGER NOT NULL DEFAULT 1,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FeeReminderRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FeeReminderLog" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "invoiceId" TEXT,
  "ruleId" TEXT,
  "channels" JSONB NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  "sentById" TEXT,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FeeReminderLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TransportFeeRate" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "stopId" TEXT NOT NULL,
  "feeHeadId" TEXT NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  "effectiveFrom" DATE NOT NULL,
  "effectiveTo" DATE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TransportFeeRate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FeeInstallment_tenantId_structureId_name_key" ON "FeeInstallment"("tenantId", "structureId", "name");
CREATE INDEX "FeeInstallment_tenantId_structureId_dueOn_idx" ON "FeeInstallment"("tenantId", "structureId", "dueOn");
CREATE UNIQUE INDEX "FeeInstallmentLine_tenantId_installmentId_feeHeadId_key" ON "FeeInstallmentLine"("tenantId", "installmentId", "feeHeadId");
CREATE INDEX "FeeInstallmentLine_tenantId_feeHeadId_idx" ON "FeeInstallmentLine"("tenantId", "feeHeadId");
CREATE UNIQUE INDEX "StudentFeeAssignment_tenantId_studentId_sessionId_structureId_key" ON "StudentFeeAssignment"("tenantId", "studentId", "sessionId", "structureId");
CREATE INDEX "StudentFeeAssignment_tenantId_sessionId_status_idx" ON "StudentFeeAssignment"("tenantId", "sessionId", "status");
CREATE INDEX "StudentFeeAssignment_tenantId_studentId_status_idx" ON "StudentFeeAssignment"("tenantId", "studentId", "status");
CREATE INDEX "StudentFeeCredit_tenantId_studentId_createdAt_idx" ON "StudentFeeCredit"("tenantId", "studentId", "createdAt");
CREATE INDEX "StudentFeeCredit_tenantId_paymentId_idx" ON "StudentFeeCredit"("tenantId", "paymentId");
CREATE INDEX "FeeAdjustment_tenantId_studentId_createdAt_idx" ON "FeeAdjustment"("tenantId", "studentId", "createdAt");
CREATE INDEX "FeeAdjustment_tenantId_invoiceId_idx" ON "FeeAdjustment"("tenantId", "invoiceId");
CREATE INDEX "FeeAdjustment_tenantId_reversedAdjustmentId_idx" ON "FeeAdjustment"("tenantId", "reversedAdjustmentId");
CREATE UNIQUE INDEX "FeeReminderRule_tenantId_name_key" ON "FeeReminderRule"("tenantId", "name");
CREATE INDEX "FeeReminderRule_tenantId_isActive_idx" ON "FeeReminderRule"("tenantId", "isActive");
CREATE INDEX "FeeReminderLog_tenantId_studentId_sentAt_idx" ON "FeeReminderLog"("tenantId", "studentId", "sentAt");
CREATE INDEX "FeeReminderLog_tenantId_invoiceId_sentAt_idx" ON "FeeReminderLog"("tenantId", "invoiceId", "sentAt");
CREATE INDEX "FeeReminderLog_tenantId_ruleId_sentAt_idx" ON "FeeReminderLog"("tenantId", "ruleId", "sentAt");
CREATE UNIQUE INDEX "TransportFeeRate_tenantId_stopId_feeHeadId_effectiveFrom_key" ON "TransportFeeRate"("tenantId", "stopId", "feeHeadId", "effectiveFrom");
CREATE INDEX "TransportFeeRate_tenantId_effectiveFrom_effectiveTo_idx" ON "TransportFeeRate"("tenantId", "effectiveFrom", "effectiveTo");

ALTER TABLE "FeeInstallment" ADD CONSTRAINT "FeeInstallment_structureId_fkey" FOREIGN KEY ("structureId") REFERENCES "FeeStructure"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeeInstallmentLine" ADD CONSTRAINT "FeeInstallmentLine_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "FeeInstallment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeeInstallmentLine" ADD CONSTRAINT "FeeInstallmentLine_feeHeadId_fkey" FOREIGN KEY ("feeHeadId") REFERENCES "FeeHead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentFeeAssignment" ADD CONSTRAINT "StudentFeeAssignment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentFeeAssignment" ADD CONSTRAINT "StudentFeeAssignment_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AcademicSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentFeeAssignment" ADD CONSTRAINT "StudentFeeAssignment_structureId_fkey" FOREIGN KEY ("structureId") REFERENCES "FeeStructure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentFeeCredit" ADD CONSTRAINT "StudentFeeCredit_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentFeeCredit" ADD CONSTRAINT "StudentFeeCredit_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "FeePayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StudentFeeCredit" ADD CONSTRAINT "StudentFeeCredit_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "FeeInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FeeAdjustment" ADD CONSTRAINT "FeeAdjustment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeeAdjustment" ADD CONSTRAINT "FeeAdjustment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "FeeInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FeeReminderLog" ADD CONSTRAINT "FeeReminderLog_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TransportFeeRate" ADD CONSTRAINT "TransportFeeRate_stopId_fkey" FOREIGN KEY ("stopId") REFERENCES "BusStop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TransportFeeRate" ADD CONSTRAINT "TransportFeeRate_feeHeadId_fkey" FOREIGN KEY ("feeHeadId") REFERENCES "FeeHead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
