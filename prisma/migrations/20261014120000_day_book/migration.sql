-- Accounting phase 4: Day Book. Additive only: three nullable columns on
-- SchoolExpense, no foreign keys, existing rows keep NULL (nulls never collide
-- in a unique index).

-- AlterTable
ALTER TABLE "SchoolExpense" ADD COLUMN     "cashAccountId" TEXT,
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "voucherNumber" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "SchoolExpense_tenantId_voucherNumber_key" ON "SchoolExpense"("tenantId", "voucherNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolExpense_tenantId_idempotencyKey_key" ON "SchoolExpense"("tenantId", "idempotencyKey");
