-- Optional link from a store goods receipt to the vendor master. Additive and nullable:
-- existing purchases keep their free-text vendorName and stay unlinked.
ALTER TABLE "StorePurchase" ADD COLUMN "vendorId" TEXT;

CREATE INDEX "StorePurchase_tenantId_vendorId_idx" ON "StorePurchase"("tenantId", "vendorId");

ALTER TABLE "StorePurchase" ADD CONSTRAINT "StorePurchase_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
