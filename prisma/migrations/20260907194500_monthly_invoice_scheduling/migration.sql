ALTER TABLE "StudentFeeAssignment"
  ADD COLUMN "autoGenerateFrom" DATE;

CREATE INDEX "StudentFeeAssignment_tenantId_autoGenerateFrom_status_idx"
  ON "StudentFeeAssignment"("tenantId", "autoGenerateFrom", "status");
