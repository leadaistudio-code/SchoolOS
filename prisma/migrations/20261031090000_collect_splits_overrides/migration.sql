-- Split counter collections (cash + UPI …) share one collection id.
ALTER TABLE "FeePayment" ADD COLUMN "collectionId" TEXT;
CREATE INDEX "FeePayment_tenantId_collectionId_idx" ON "FeePayment"("tenantId", "collectionId");

-- Per-student amounts for plan installments that are not invoiced yet.
CREATE TABLE "StudentFeeLineOverride" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "installmentLineId" TEXT NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  "reason" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudentFeeLineOverride_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StudentFeeLineOverride_tenantId_studentId_installmentLineId_key"
  ON "StudentFeeLineOverride"("tenantId", "studentId", "installmentLineId");
CREATE INDEX "StudentFeeLineOverride_tenantId_installmentLineId_idx"
  ON "StudentFeeLineOverride"("tenantId", "installmentLineId");

-- Admin deletion of store items that already have history.
ALTER TABLE "StoreItem" ADD COLUMN "deletedAt" TIMESTAMP(3);
