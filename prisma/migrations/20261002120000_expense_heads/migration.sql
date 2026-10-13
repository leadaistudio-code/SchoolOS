-- CreateEnum
CREATE TYPE "ExpenseNature" AS ENUM ('DIRECT', 'INDIRECT');

-- AlterTable
ALTER TABLE "LedgerAccount" ADD COLUMN "expenseNature" "ExpenseNature";

-- AlterTable
ALTER TABLE "SchoolExpense" ADD COLUMN "headId" TEXT,
ADD COLUMN "nature" "ExpenseNature" NOT NULL DEFAULT 'INDIRECT',
ADD COLUMN "receiptKey" TEXT,
ADD COLUMN "receiptName" TEXT,
ADD COLUMN "receiptMime" TEXT;

-- CreateTable
CREATE TABLE "ExpenseHead" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL DEFAULT 'OTHER',
    "nature" "ExpenseNature" NOT NULL DEFAULT 'INDIRECT',
    "accountId" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseHead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseHead_tenantId_name_key" ON "ExpenseHead"("tenantId", "name");
CREATE INDEX "ExpenseHead_tenantId_isActive_idx" ON "ExpenseHead"("tenantId", "isActive");
CREATE INDEX "SchoolExpense_tenantId_nature_expenseDate_idx" ON "SchoolExpense"("tenantId", "nature", "expenseDate");
CREATE INDEX "SchoolExpense_tenantId_headId_idx" ON "SchoolExpense"("tenantId", "headId");

-- AddForeignKey
ALTER TABLE "SchoolExpense" ADD CONSTRAINT "SchoolExpense_headId_fkey" FOREIGN KEY ("headId") REFERENCES "ExpenseHead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExpenseHead" ADD CONSTRAINT "ExpenseHead_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LedgerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: teaching-delivery categories are direct costs, the rest indirect.
UPDATE "SchoolExpense" SET "nature" = 'DIRECT'
WHERE "category"::text IN ('SALARY', 'ACADEMIC', 'TRANSPORT', 'FOOD', 'EVENTS');

UPDATE "LedgerAccount" SET "expenseNature" = 'DIRECT'
WHERE "systemKey" IN ('EXP_SALARY', 'EXP_ACADEMIC', 'EXP_TRANSPORT', 'EXP_FOOD', 'EXP_EVENTS');

UPDATE "LedgerAccount" SET "expenseNature" = 'INDIRECT'
WHERE "type" = 'EXPENSE' AND "expenseNature" IS NULL;