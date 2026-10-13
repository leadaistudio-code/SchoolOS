-- CreateEnum
CREATE TYPE "StoreCategory" AS ENUM ('BOOKS', 'STATIONERY', 'UNIFORM', 'SHOES', 'BAGS', 'ACCESSORIES', 'SPORTS', 'OTHER');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('OPENING', 'PURCHASE', 'SALE', 'SALE_RETURN', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT');

-- CreateEnum
CREATE TYPE "StoreSaleStatus" AS ENUM ('COMPLETED', 'VOIDED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "JournalSourceType" ADD VALUE 'STORE_SALE';
ALTER TYPE "JournalSourceType" ADD VALUE 'STORE_PURCHASE';
ALTER TYPE "JournalSourceType" ADD VALUE 'STORE_STOCK';

-- AlterTable
ALTER TABLE "LedgerSettings" ADD COLUMN     "autoPostStore" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "StoreItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "StoreCategory" NOT NULL DEFAULT 'OTHER',
    "variant" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'pcs',
    "hsnCode" TEXT,
    "barcode" TEXT,
    "taxPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sellingPriceMinor" INTEGER NOT NULL,
    "avgCostMinor" INTEGER NOT NULL DEFAULT 0,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "reorderLevel" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCostMinor" INTEGER NOT NULL DEFAULT 0,
    "balanceAfter" INTEGER NOT NULL,
    "saleId" TEXT,
    "purchaseId" TEXT,
    "reason" TEXT,
    "actorId" TEXT,
    "actorLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorePurchase" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "vendorName" TEXT NOT NULL,
    "invoiceNo" TEXT,
    "purchaseDate" DATE NOT NULL,
    "paymentMode" TEXT NOT NULL DEFAULT 'CASH',
    "totalMinor" INTEGER NOT NULL,
    "notes" TEXT,
    "createdById" TEXT,
    "createdByLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorePurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorePurchaseLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCostMinor" INTEGER NOT NULL,
    "amountMinor" INTEGER NOT NULL,

    CONSTRAINT "StorePurchaseLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreSale" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "soldAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "studentId" TEXT,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "grossMinor" INTEGER NOT NULL,
    "discountMinor" INTEGER NOT NULL DEFAULT 0,
    "taxMinor" INTEGER NOT NULL DEFAULT 0,
    "totalMinor" INTEGER NOT NULL,
    "costMinor" INTEGER NOT NULL DEFAULT 0,
    "paymentMode" TEXT NOT NULL,
    "paymentRef" TEXT,
    "status" "StoreSaleStatus" NOT NULL DEFAULT 'COMPLETED',
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "voidedById" TEXT,
    "soldById" TEXT,
    "soldByLabel" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreSaleLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceMinor" INTEGER NOT NULL,
    "discountMinor" INTEGER NOT NULL DEFAULT 0,
    "taxPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxMinor" INTEGER NOT NULL DEFAULT 0,
    "amountMinor" INTEGER NOT NULL,
    "unitCostMinor" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StoreSaleLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StoreItem_tenantId_category_idx" ON "StoreItem"("tenantId", "category");

-- CreateIndex
CREATE INDEX "StoreItem_tenantId_name_idx" ON "StoreItem"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "StoreItem_tenantId_sku_key" ON "StoreItem"("tenantId", "sku");

-- CreateIndex
CREATE INDEX "StockMovement_tenantId_itemId_createdAt_idx" ON "StockMovement"("tenantId", "itemId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_tenantId_type_createdAt_idx" ON "StockMovement"("tenantId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_tenantId_saleId_idx" ON "StockMovement"("tenantId", "saleId");

-- CreateIndex
CREATE INDEX "StorePurchase_tenantId_purchaseDate_idx" ON "StorePurchase"("tenantId", "purchaseDate");

-- CreateIndex
CREATE UNIQUE INDEX "StorePurchase_tenantId_number_key" ON "StorePurchase"("tenantId", "number");

-- CreateIndex
CREATE INDEX "StorePurchaseLine_tenantId_purchaseId_idx" ON "StorePurchaseLine"("tenantId", "purchaseId");

-- CreateIndex
CREATE INDEX "StorePurchaseLine_tenantId_itemId_idx" ON "StorePurchaseLine"("tenantId", "itemId");

-- CreateIndex
CREATE INDEX "StoreSale_tenantId_soldAt_idx" ON "StoreSale"("tenantId", "soldAt");

-- CreateIndex
CREATE INDEX "StoreSale_tenantId_studentId_idx" ON "StoreSale"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "StoreSale_tenantId_status_idx" ON "StoreSale"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StoreSale_tenantId_number_key" ON "StoreSale"("tenantId", "number");

-- CreateIndex
CREATE INDEX "StoreSaleLine_tenantId_saleId_idx" ON "StoreSaleLine"("tenantId", "saleId");

-- CreateIndex
CREATE INDEX "StoreSaleLine_tenantId_itemId_idx" ON "StoreSaleLine"("tenantId", "itemId");

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "StoreItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorePurchaseLine" ADD CONSTRAINT "StorePurchaseLine_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "StorePurchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorePurchaseLine" ADD CONSTRAINT "StorePurchaseLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "StoreItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreSale" ADD CONSTRAINT "StoreSale_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreSaleLine" ADD CONSTRAINT "StoreSaleLine_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "StoreSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreSaleLine" ADD CONSTRAINT "StoreSaleLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "StoreItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

