-- AlterTable
ALTER TABLE "FeePayment" ADD COLUMN     "billBookNo" TEXT;

-- CreateIndex
CREATE INDEX "FeePayment_tenantId_billBookNo_idx" ON "FeePayment"("tenantId", "billBookNo");
