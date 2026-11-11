-- CreateEnum
CREATE TYPE "LmsOrderStatus" AS ENUM ('CREATED', 'PAID', 'FAILED');

-- AlterTable
ALTER TABLE "LmsCourse" ADD COLUMN     "academyPriceMinor" INTEGER;

-- CreateTable
CREATE TABLE "LmsAcademyOrder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" TEXT,
    "courseId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "LmsOrderStatus" NOT NULL DEFAULT 'CREATED',
    "provider" TEXT NOT NULL,
    "providerOrderId" TEXT,
    "providerPaymentId" TEXT,
    "failureReason" TEXT,
    "paidAt" TIMESTAMP(3),
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LmsAcademyOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LmsAcademyOrder_providerOrderId_key" ON "LmsAcademyOrder"("providerOrderId");

-- CreateIndex
CREATE INDEX "LmsAcademyOrder_tenantId_status_createdAt_idx" ON "LmsAcademyOrder"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "LmsAcademyOrder_tenantId_studentId_idx" ON "LmsAcademyOrder"("tenantId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "LmsAcademyOrder_tenantId_number_key" ON "LmsAcademyOrder"("tenantId", "number");

-- AddForeignKey
ALTER TABLE "LmsAcademyOrder" ADD CONSTRAINT "LmsAcademyOrder_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "LmsCourse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
