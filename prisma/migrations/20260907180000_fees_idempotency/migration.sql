-- Database-enforced idempotency for generated charges and reminder sends.
ALTER TABLE "FeeInvoice" ADD COLUMN "sourceKey" TEXT;
ALTER TABLE "FeeReminderLog" ADD COLUMN "slot" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "FeeInvoice_tenantId_sourceKey_key"
  ON "FeeInvoice"("tenantId", "sourceKey");
CREATE UNIQUE INDEX "FeeReminderLog_tenantId_ruleId_invoiceId_slot_key"
  ON "FeeReminderLog"("tenantId", "ruleId", "invoiceId", "slot");
