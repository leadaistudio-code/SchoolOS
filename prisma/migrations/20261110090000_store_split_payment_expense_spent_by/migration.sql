-- AlterTable
ALTER TABLE "SchoolExpense" ADD COLUMN "spentBy" TEXT;

-- AlterTable
ALTER TABLE "ExpenseApprovalRequest" ADD COLUMN "spentBy" TEXT;

-- CreateTable
CREATE TABLE "StoreSalePayment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreSalePayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StoreSalePayment_tenantId_saleId_idx" ON "StoreSalePayment"("tenantId", "saleId");

-- CreateIndex
CREATE INDEX "StoreSalePayment_tenantId_mode_idx" ON "StoreSalePayment"("tenantId", "mode");

-- AddForeignKey
ALTER TABLE "StoreSalePayment" ADD CONSTRAINT "StoreSalePayment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "StoreSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
