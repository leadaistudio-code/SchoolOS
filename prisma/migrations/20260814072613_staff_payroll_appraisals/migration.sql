-- CreateEnum
CREATE TYPE "PayslipStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'PAID');

-- CreateEnum
CREATE TYPE "AppraisalStatus" AS ENUM ('DRAFT', 'SELF_REVIEW', 'MANAGER_REVIEW', 'COMPLETED');

-- CreateTable
CREATE TABLE "StaffSalaryStructure" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "basicMinor" INTEGER NOT NULL DEFAULT 0,
    "hraMinor" INTEGER NOT NULL DEFAULT 0,
    "allowancesMinor" INTEGER NOT NULL DEFAULT 0,
    "deductionsMinor" INTEGER NOT NULL DEFAULT 0,
    "grossMinor" INTEGER NOT NULL DEFAULT 0,
    "netMinor" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffSalaryStructure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffPayslip" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "workingDays" INTEGER NOT NULL DEFAULT 0,
    "paidDays" INTEGER NOT NULL DEFAULT 0,
    "basicMinor" INTEGER NOT NULL DEFAULT 0,
    "hraMinor" INTEGER NOT NULL DEFAULT 0,
    "allowancesMinor" INTEGER NOT NULL DEFAULT 0,
    "bonusMinor" INTEGER NOT NULL DEFAULT 0,
    "deductionsMinor" INTEGER NOT NULL DEFAULT 0,
    "lopMinor" INTEGER NOT NULL DEFAULT 0,
    "grossMinor" INTEGER NOT NULL DEFAULT 0,
    "netMinor" INTEGER NOT NULL DEFAULT 0,
    "status" "PayslipStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "generatedById" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffPayslip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffAppraisal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "cycleName" TEXT NOT NULL,
    "periodFrom" DATE NOT NULL,
    "periodTo" DATE NOT NULL,
    "status" "AppraisalStatus" NOT NULL DEFAULT 'DRAFT',
    "selfComment" TEXT,
    "reviewerStaffId" TEXT,
    "reviewerComment" TEXT,
    "overallRating" DOUBLE PRECISION,
    "strengths" TEXT,
    "improvements" TEXT,
    "goals" TEXT,
    "outcome" TEXT,
    "incrementMinor" INTEGER,
    "submittedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffAppraisal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffAppraisalRating" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "appraisalId" TEXT NOT NULL,
    "competency" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,

    CONSTRAINT "StaffAppraisalRating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffSalaryStructure_tenantId_staffId_effectiveFrom_idx" ON "StaffSalaryStructure"("tenantId", "staffId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "StaffSalaryStructure_tenantId_staffId_effectiveFrom_key" ON "StaffSalaryStructure"("tenantId", "staffId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "StaffPayslip_tenantId_periodYear_periodMonth_status_idx" ON "StaffPayslip"("tenantId", "periodYear", "periodMonth", "status");

-- CreateIndex
CREATE INDEX "StaffPayslip_tenantId_staffId_idx" ON "StaffPayslip"("tenantId", "staffId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffPayslip_tenantId_staffId_periodYear_periodMonth_key" ON "StaffPayslip"("tenantId", "staffId", "periodYear", "periodMonth");

-- CreateIndex
CREATE INDEX "StaffAppraisal_tenantId_status_periodTo_idx" ON "StaffAppraisal"("tenantId", "status", "periodTo");

-- CreateIndex
CREATE INDEX "StaffAppraisal_tenantId_staffId_idx" ON "StaffAppraisal"("tenantId", "staffId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffAppraisal_tenantId_staffId_cycleName_key" ON "StaffAppraisal"("tenantId", "staffId", "cycleName");

-- CreateIndex
CREATE INDEX "StaffAppraisalRating_tenantId_appraisalId_idx" ON "StaffAppraisalRating"("tenantId", "appraisalId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffAppraisalRating_tenantId_appraisalId_competency_key" ON "StaffAppraisalRating"("tenantId", "appraisalId", "competency");

-- AddForeignKey
ALTER TABLE "StaffSalaryStructure" ADD CONSTRAINT "StaffSalaryStructure_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffPayslip" ADD CONSTRAINT "StaffPayslip_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffAppraisal" ADD CONSTRAINT "StaffAppraisal_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffAppraisal" ADD CONSTRAINT "StaffAppraisal_reviewerStaffId_fkey" FOREIGN KEY ("reviewerStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffAppraisalRating" ADD CONSTRAINT "StaffAppraisalRating_appraisalId_fkey" FOREIGN KEY ("appraisalId") REFERENCES "StaffAppraisal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
