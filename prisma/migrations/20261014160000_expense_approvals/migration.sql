-- CreateEnum
CREATE TYPE "ExpenseApprovalStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'PENDING_L1', 'PENDING_L2', 'PENDING_FINAL', 'RETURNED', 'REJECTED', 'WITHDRAWN', 'POSTED', 'REVERSED');

-- CreateTable
CREATE TABLE "ExpenseApprovalRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "headId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "expenseDate" DATE NOT NULL,
    "paymentMode" "ExpensePaymentMode" NOT NULL DEFAULT 'CASH',
    "vendor" TEXT,
    "referenceNo" TEXT,
    "notes" TEXT,
    "cashAccountId" TEXT,
    "receiptKey" TEXT,
    "receiptName" TEXT,
    "receiptMime" TEXT,
    "status" "ExpenseApprovalStatus" NOT NULL DEFAULT 'DRAFT',
    "cycle" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT,
    "createdByLabel" TEXT,
    "submittedAt" TIMESTAMP(3),
    "expenseId" TEXT,
    "postedAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseApprovalStep" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "cycle" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" "ExpenseApprovalStatus" NOT NULL,
    "toStatus" "ExpenseApprovalStatus" NOT NULL,
    "actorId" TEXT,
    "actorLabel" TEXT,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseApprovalStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExpenseApprovalRequest_tenantId_status_expenseDate_idx" ON "ExpenseApprovalRequest"("tenantId", "status", "expenseDate");

-- CreateIndex
CREATE INDEX "ExpenseApprovalRequest_tenantId_createdById_idx" ON "ExpenseApprovalRequest"("tenantId", "createdById");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseApprovalRequest_tenantId_number_key" ON "ExpenseApprovalRequest"("tenantId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseApprovalRequest_tenantId_expenseId_key" ON "ExpenseApprovalRequest"("tenantId", "expenseId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseApprovalRequest_tenantId_idempotencyKey_key" ON "ExpenseApprovalRequest"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "ExpenseApprovalStep_tenantId_requestId_createdAt_idx" ON "ExpenseApprovalStep"("tenantId", "requestId", "createdAt");

-- CreateIndex
CREATE INDEX "ExpenseApprovalStep_tenantId_actorId_idx" ON "ExpenseApprovalStep"("tenantId", "actorId");

-- AddForeignKey
ALTER TABLE "ExpenseApprovalStep" ADD CONSTRAINT "ExpenseApprovalStep_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ExpenseApprovalRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Checks: positive amounts, and a request is linked to an expense exactly when it was posted.
ALTER TABLE "ExpenseApprovalRequest"
  ADD CONSTRAINT "ExpenseApprovalRequest_amount_check" CHECK ("amountMinor" > 0),
  ADD CONSTRAINT "ExpenseApprovalRequest_cycle_check" CHECK ("cycle" >= 1),
  ADD CONSTRAINT "ExpenseApprovalRequest_posted_check" CHECK (
    ("status" IN ('POSTED', 'REVERSED')) = ("expenseId" IS NOT NULL AND "postedAt" IS NOT NULL)
  ),
  ADD CONSTRAINT "ExpenseApprovalRequest_reversed_check" CHECK (("status" = 'REVERSED') = ("reversedAt" IS NOT NULL));

