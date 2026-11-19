-- Treat blank barcodes as missing.
UPDATE "StoreItem" SET barcode = NULL WHERE barcode IS NOT NULL AND btrim(barcode) = '';

-- Clear duplicate barcodes so the unique index can be added (keep oldest per tenant+barcode).
UPDATE "StoreItem" AS s
SET barcode = NULL
WHERE s.barcode IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM "StoreItem" AS older
    WHERE older."tenantId" = s."tenantId"
      AND older.barcode = s.barcode
      AND older."createdAt" < s."createdAt"
  );

-- Unique barcode per tenant (multiple NULLs allowed).
CREATE UNIQUE INDEX IF NOT EXISTS "StoreItem_tenantId_barcode_key" ON "StoreItem"("tenantId", "barcode");
