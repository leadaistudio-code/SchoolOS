-- Default selling discount per store item, applied at the counter.
ALTER TABLE "StoreItem" ADD COLUMN "discountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0;
