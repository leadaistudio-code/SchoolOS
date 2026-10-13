-- CreateEnum
CREATE TYPE "TransferCertificateStatus" AS ENUM ('ISSUED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "aadhaarNo" TEXT,
ADD COLUMN     "birthPlace" TEXT,
ADD COLUMN     "caste" TEXT,
ADD COLUMN     "disability" TEXT,
ADD COLUMN     "house" TEXT,
ADD COLUMN     "identificationMark" TEXT,
ADD COLUMN     "whatsappPhone" TEXT;

-- CreateTable
CREATE TABLE "TransferCertificate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "bookNo" TEXT,
    "applicationDate" DATE,
    "issuedOn" DATE NOT NULL,
    "reason" TEXT,
    "details" JSONB NOT NULL,
    "status" "TransferCertificateStatus" NOT NULL DEFAULT 'ISSUED',
    "previousStatus" "StudentStatus" NOT NULL DEFAULT 'ACTIVE',
    "loginDisabled" BOOLEAN NOT NULL DEFAULT false,
    "issuedById" TEXT,
    "issuedByLabel" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "cancelledById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransferCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TransferCertificate_tenantId_studentId_idx" ON "TransferCertificate"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "TransferCertificate_tenantId_issuedOn_idx" ON "TransferCertificate"("tenantId", "issuedOn");

-- CreateIndex
CREATE UNIQUE INDEX "TransferCertificate_tenantId_number_key" ON "TransferCertificate"("tenantId", "number");

-- AddForeignKey
ALTER TABLE "TransferCertificate" ADD CONSTRAINT "TransferCertificate_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
