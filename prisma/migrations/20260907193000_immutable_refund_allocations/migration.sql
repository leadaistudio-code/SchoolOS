CREATE TABLE "FeeRefundAllocation" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "refundId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  CONSTRAINT "FeeRefundAllocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FeeRefundAllocation_tenantId_refundId_invoiceId_key"
  ON "FeeRefundAllocation"("tenantId", "refundId", "invoiceId");
CREATE INDEX "FeeRefundAllocation_tenantId_invoiceId_idx"
  ON "FeeRefundAllocation"("tenantId", "invoiceId");

ALTER TABLE "FeeRefundAllocation" ADD CONSTRAINT "FeeRefundAllocation_refundId_fkey"
  FOREIGN KEY ("refundId") REFERENCES "FeeRefund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FeeRefundAllocation" ADD CONSTRAINT "FeeRefundAllocation_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "FeeInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FeeRefundAllocation" ADD CONSTRAINT "FeeRefundAllocation_positive_amount"
  CHECK ("amountMinor" > 0);
