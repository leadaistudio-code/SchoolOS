-- CreateTable
CREATE TABLE "RoiCalculation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "schoolName" TEXT NOT NULL,
    "contactName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "studentCount" INTEGER NOT NULL,
    "scenario" TEXT NOT NULL,
    "includeRevenue" BOOLEAN NOT NULL DEFAULT false,
    "inputs" JSONB NOT NULL,
    "assumptions" JSONB NOT NULL,
    "results" JSONB NOT NULL,
    "netMonthlyBenefit" DOUBLE PRECISION NOT NULL,
    "roiPercent" DOUBLE PRECISION,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoiCalculation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RoiCalculation_tenantId_createdAt_idx" ON "RoiCalculation"("tenantId", "createdAt");
