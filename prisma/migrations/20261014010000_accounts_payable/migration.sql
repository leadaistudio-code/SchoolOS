-- CreateEnum
CREATE TYPE "PurchaseVoucherStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VendorDocumentStatus" AS ENUM ('POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DebitNoteStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VendorAdjustmentType" AS ENUM ('DISCOUNT', 'WRITE_OFF');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "JournalSourceType" ADD VALUE 'PURCHASE_VOUCHER';
ALTER TYPE "JournalSourceType" ADD VALUE 'VENDOR_PAYMENT';
ALTER TYPE "JournalSourceType" ADD VALUE 'DEBIT_NOTE';
ALTER TYPE "JournalSourceType" ADD VALUE 'VENDOR_ADJUSTMENT';

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactPerson" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "gstin" TEXT,
    "pan" TEXT,
    "creditDays" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseVoucher" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "supplierInvoiceNo" TEXT NOT NULL,
    "supplierInvoiceKey" TEXT NOT NULL,
    "invoiceDate" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "status" "PurchaseVoucherStatus" NOT NULL DEFAULT 'DRAFT',
    "subtotalMinor" INTEGER NOT NULL,
    "taxMinor" INTEGER NOT NULL DEFAULT 0,
    "totalMinor" INTEGER NOT NULL,
    "narration" TEXT,
    "attachmentKey" TEXT,
    "attachmentName" TEXT,
    "attachmentMime" TEXT,
    "attachmentSize" INTEGER,
    "idempotencyKey" TEXT,
    "createdById" TEXT,
    "createdByLabel" TEXT,
    "postedAt" TIMESTAMP(3),
    "postedById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseVoucher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseVoucherLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "storeItemId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitCostMinor" INTEGER NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "taxPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxMinor" INTEGER NOT NULL DEFAULT 0,
    "totalMinor" INTEGER NOT NULL,

    CONSTRAINT "PurchaseVoucherLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorPayment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "paidOn" DATE NOT NULL,
    "mode" TEXT NOT NULL,
    "reference" TEXT,
    "amountMinor" INTEGER NOT NULL,
    "narration" TEXT,
    "status" "VendorDocumentStatus" NOT NULL DEFAULT 'POSTED',
    "idempotencyKey" TEXT,
    "createdById" TEXT,
    "createdByLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancelReason" TEXT,

    CONSTRAINT "VendorPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorPaymentAllocation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,

    CONSTRAINT "VendorPaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebitNote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "noteDate" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "DebitNoteStatus" NOT NULL DEFAULT 'SUBMITTED',
    "totalMinor" INTEGER NOT NULL,
    "attachmentKey" TEXT,
    "attachmentName" TEXT,
    "attachmentMime" TEXT,
    "attachmentSize" INTEGER,
    "idempotencyKey" TEXT,
    "createdById" TEXT,
    "createdByLabel" TEXT,
    "approvedById" TEXT,
    "approvedByLabel" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedById" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DebitNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebitNoteLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "debitNoteId" TEXT NOT NULL,
    "voucherLineId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "taxMinor" INTEGER NOT NULL DEFAULT 0,
    "totalMinor" INTEGER NOT NULL,

    CONSTRAINT "DebitNoteLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorAdjustment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "type" "VendorAdjustmentType" NOT NULL,
    "adjustedOn" DATE NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "VendorDocumentStatus" NOT NULL DEFAULT 'POSTED',
    "idempotencyKey" TEXT,
    "createdById" TEXT,
    "createdByLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancelReason" TEXT,

    CONSTRAINT "VendorAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Vendor_tenantId_name_idx" ON "Vendor"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Vendor_tenantId_isActive_idx" ON "Vendor"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_tenantId_code_key" ON "Vendor"("tenantId", "code");

-- CreateIndex
CREATE INDEX "PurchaseVoucher_tenantId_vendorId_status_idx" ON "PurchaseVoucher"("tenantId", "vendorId", "status");

-- CreateIndex
CREATE INDEX "PurchaseVoucher_tenantId_dueDate_idx" ON "PurchaseVoucher"("tenantId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseVoucher_tenantId_number_key" ON "PurchaseVoucher"("tenantId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseVoucher_tenantId_vendorId_supplierInvoiceKey_key" ON "PurchaseVoucher"("tenantId", "vendorId", "supplierInvoiceKey");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseVoucher_tenantId_idempotencyKey_key" ON "PurchaseVoucher"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "PurchaseVoucherLine_tenantId_voucherId_idx" ON "PurchaseVoucherLine"("tenantId", "voucherId");

-- CreateIndex
CREATE INDEX "VendorPayment_tenantId_vendorId_paidOn_idx" ON "VendorPayment"("tenantId", "vendorId", "paidOn");

-- CreateIndex
CREATE UNIQUE INDEX "VendorPayment_tenantId_number_key" ON "VendorPayment"("tenantId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "VendorPayment_tenantId_idempotencyKey_key" ON "VendorPayment"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "VendorPaymentAllocation_tenantId_voucherId_idx" ON "VendorPaymentAllocation"("tenantId", "voucherId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorPaymentAllocation_tenantId_paymentId_voucherId_key" ON "VendorPaymentAllocation"("tenantId", "paymentId", "voucherId");

-- CreateIndex
CREATE INDEX "DebitNote_tenantId_vendorId_status_idx" ON "DebitNote"("tenantId", "vendorId", "status");

-- CreateIndex
CREATE INDEX "DebitNote_tenantId_voucherId_idx" ON "DebitNote"("tenantId", "voucherId");

-- CreateIndex
CREATE UNIQUE INDEX "DebitNote_tenantId_number_key" ON "DebitNote"("tenantId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "DebitNote_tenantId_idempotencyKey_key" ON "DebitNote"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "DebitNoteLine_tenantId_debitNoteId_idx" ON "DebitNoteLine"("tenantId", "debitNoteId");

-- CreateIndex
CREATE INDEX "DebitNoteLine_tenantId_voucherLineId_idx" ON "DebitNoteLine"("tenantId", "voucherLineId");

-- CreateIndex
CREATE INDEX "VendorAdjustment_tenantId_vendorId_idx" ON "VendorAdjustment"("tenantId", "vendorId");

-- CreateIndex
CREATE INDEX "VendorAdjustment_tenantId_voucherId_idx" ON "VendorAdjustment"("tenantId", "voucherId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorAdjustment_tenantId_number_key" ON "VendorAdjustment"("tenantId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "VendorAdjustment_tenantId_idempotencyKey_key" ON "VendorAdjustment"("tenantId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "PurchaseVoucher" ADD CONSTRAINT "PurchaseVoucher_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseVoucherLine" ADD CONSTRAINT "PurchaseVoucherLine_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "PurchaseVoucher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorPayment" ADD CONSTRAINT "VendorPayment_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorPaymentAllocation" ADD CONSTRAINT "VendorPaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "VendorPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorPaymentAllocation" ADD CONSTRAINT "VendorPaymentAllocation_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "PurchaseVoucher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebitNote" ADD CONSTRAINT "DebitNote_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebitNote" ADD CONSTRAINT "DebitNote_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "PurchaseVoucher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebitNoteLine" ADD CONSTRAINT "DebitNoteLine_debitNoteId_fkey" FOREIGN KEY ("debitNoteId") REFERENCES "DebitNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebitNoteLine" ADD CONSTRAINT "DebitNoteLine_voucherLineId_fkey" FOREIGN KEY ("voucherLineId") REFERENCES "PurchaseVoucherLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorAdjustment" ADD CONSTRAINT "VendorAdjustment_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorAdjustment" ADD CONSTRAINT "VendorAdjustment_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "PurchaseVoucher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Guard rails: money is positive paise, and line maths cannot be bypassed.
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_credit_days_check" CHECK ("creditDays" >= 0 AND "creditDays" <= 365);
ALTER TABLE "PurchaseVoucher" ADD CONSTRAINT "PurchaseVoucher_amounts_check" CHECK ("subtotalMinor" >= 0 AND "taxMinor" >= 0 AND "totalMinor" > 0 AND "totalMinor" = "subtotalMinor" + "taxMinor");
ALTER TABLE "PurchaseVoucher" ADD CONSTRAINT "PurchaseVoucher_due_check" CHECK ("dueDate" >= "invoiceDate");
ALTER TABLE "PurchaseVoucherLine" ADD CONSTRAINT "PurchaseVoucherLine_amounts_check" CHECK ("quantity" > 0 AND "unitCostMinor" >= 0 AND "amountMinor" >= 0 AND "taxMinor" >= 0 AND "totalMinor" = "amountMinor" + "taxMinor");
ALTER TABLE "VendorPayment" ADD CONSTRAINT "VendorPayment_amount_check" CHECK ("amountMinor" > 0);
ALTER TABLE "VendorPaymentAllocation" ADD CONSTRAINT "VendorPaymentAllocation_amount_check" CHECK ("amountMinor" > 0);
ALTER TABLE "DebitNote" ADD CONSTRAINT "DebitNote_total_check" CHECK ("totalMinor" > 0);
ALTER TABLE "DebitNoteLine" ADD CONSTRAINT "DebitNoteLine_amounts_check" CHECK ("quantity" >= 0 AND "amountMinor" >= 0 AND "taxMinor" >= 0 AND "totalMinor" > 0 AND "totalMinor" = "amountMinor" + "taxMinor");
ALTER TABLE "VendorAdjustment" ADD CONSTRAINT "VendorAdjustment_amount_check" CHECK ("amountMinor" > 0);