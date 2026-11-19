-- CreateEnum
CREATE TYPE "StoreItemUnitStatus" AS ENUM ('IN_STOCK', 'SOLD', 'WRITTEN_OFF');

-- CreateTable
CREATE TABLE "StoreItemUnit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "status" "StoreItemUnitStatus" NOT NULL DEFAULT 'IN_STOCK',
    "purchaseId" TEXT,
    "saleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreItemUnit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StoreItemUnit_tenantId_itemId_status_idx" ON "StoreItemUnit"("tenantId", "itemId", "status");

-- CreateIndex
CREATE INDEX "StoreItemUnit_tenantId_purchaseId_idx" ON "StoreItemUnit"("tenantId", "purchaseId");

-- CreateIndex
CREATE INDEX "StoreItemUnit_tenantId_saleId_idx" ON "StoreItemUnit"("tenantId", "saleId");

-- CreateIndex
CREATE UNIQUE INDEX "StoreItemUnit_tenantId_barcode_key" ON "StoreItemUnit"("tenantId", "barcode");

-- AddForeignKey
ALTER TABLE "StoreItemUnit" ADD CONSTRAINT "StoreItemUnit_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "StoreItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
