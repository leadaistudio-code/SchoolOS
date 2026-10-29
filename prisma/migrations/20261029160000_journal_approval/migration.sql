-- Maker -> Checker -> (Department head) -> Accountant -> Owner approval on cost entries.
CREATE TYPE "JournalApprovalStatus" AS ENUM ('APPROVED', 'PENDING_CHECK', 'PENDING_DEPARTMENT', 'PENDING_ACCOUNTANT', 'PENDING_OWNER', 'RETURNED', 'VOID');

ALTER TABLE "JournalEntry"
  ADD COLUMN "approvalStatus" "JournalApprovalStatus" NOT NULL DEFAULT 'APPROVED',
  ADD COLUMN "approvalCycle" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "approvedById" TEXT;

CREATE INDEX "JournalEntry_tenantId_approvalStatus_idx" ON "JournalEntry"("tenantId", "approvalStatus");

CREATE TABLE "JournalApprovalStep" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "entryId" TEXT NOT NULL,
  "cycle" INTEGER NOT NULL,
  "action" TEXT NOT NULL,
  "fromStatus" "JournalApprovalStatus" NOT NULL,
  "toStatus" "JournalApprovalStatus" NOT NULL,
  "actorId" TEXT,
  "actorLabel" TEXT,
  "remarks" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JournalApprovalStep_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "JournalApprovalStep_tenantId_entryId_idx" ON "JournalApprovalStep"("tenantId", "entryId");

ALTER TABLE "JournalApprovalStep"
  ADD CONSTRAINT "JournalApprovalStep_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AccountingSettings" ADD COLUMN "departmentApprovalEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "PurchaseVoucher" ADD COLUMN "storePurchaseId" TEXT;
CREATE UNIQUE INDEX "PurchaseVoucher_tenantId_storePurchaseId_key" ON "PurchaseVoucher"("tenantId", "storePurchaseId");
