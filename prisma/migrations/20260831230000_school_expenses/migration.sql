-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('SALARY', 'UTILITIES', 'MAINTENANCE', 'SUPPLIES', 'TRANSPORT', 'FOOD', 'EVENTS', 'ADMIN', 'ACADEMIC', 'OTHER');

-- CreateEnum
CREATE TYPE "ExpensePaymentMode" AS ENUM ('CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'OTHER');

-- CreateTable
CREATE TABLE "SchoolExpense" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL DEFAULT 'OTHER',
    "amountMinor" INTEGER NOT NULL,
    "expenseDate" DATE NOT NULL,
    "paymentMode" "ExpensePaymentMode" NOT NULL DEFAULT 'CASH',
    "vendor" TEXT,
    "referenceNo" TEXT,
    "notes" TEXT,
    "recordedById" TEXT,
    "recordedByLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SchoolExpense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SchoolExpense_tenantId_expenseDate_idx" ON "SchoolExpense"("tenantId", "expenseDate");

-- CreateIndex
CREATE INDEX "SchoolExpense_tenantId_category_expenseDate_idx" ON "SchoolExpense"("tenantId", "category", "expenseDate");

-- CreateIndex
CREATE INDEX "SchoolExpense_tenantId_deletedAt_idx" ON "SchoolExpense"("tenantId", "deletedAt");
