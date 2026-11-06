-- CreateEnum
CREATE TYPE "LabType" AS ENUM ('COMPOSITE_SCIENCE', 'PHYSICS', 'CHEMISTRY', 'BIOLOGY', 'COMPUTER', 'MATHEMATICS', 'OTHER');

-- CreateEnum
CREATE TYPE "LabItemCategory" AS ENUM ('APPARATUS', 'GLASSWARE', 'INSTRUMENT', 'CHEMICAL', 'SPECIMEN', 'SLIDE', 'CHART', 'CONSUMABLE', 'SAFETY', 'EQUIPMENT');

-- CreateEnum
CREATE TYPE "LabItemKind" AS ENUM ('NON_CONSUMABLE', 'CONSUMABLE');

-- CreateEnum
CREATE TYPE "LabMovementType" AS ENUM ('OPENING', 'PURCHASE', 'ADJUSTMENT', 'CONSUMPTION', 'BREAKAGE', 'DISPOSAL');

-- CreateEnum
CREATE TYPE "LabSessionStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LabInspectionType" AS ENUM ('DAILY', 'MONTHLY', 'QUARTERLY');

-- CreateEnum
CREATE TYPE "LabIncidentType" AS ENUM ('INJURY', 'BURN', 'CHEMICAL_SPILL', 'CHEMICAL_EXPOSURE', 'FIRE', 'GAS_LEAK', 'ELECTRICAL', 'BREAKAGE', 'OTHER');

-- CreateEnum
CREATE TYPE "LabIncidentSeverity" AS ENUM ('MINOR', 'MODERATE', 'SERIOUS');

-- CreateEnum
CREATE TYPE "LabIncidentStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "LabWasteCategory" AS ENUM ('BIODEGRADABLE', 'NON_BIODEGRADABLE', 'BROKEN_GLASS', 'CHEMICAL', 'FLAMMABLE_BOTTLES', 'EMPTY_CONTAINERS');

-- CreateTable
CREATE TABLE "Lab" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "LabType" NOT NULL,
    "templateCode" TEXT,
    "room" TEXT,
    "inChargeStaffId" TEXT,
    "assistantStaffId" TEXT,
    "emergencyContacts" JSONB NOT NULL DEFAULT '[]',
    "infrastructure" JSONB NOT NULL DEFAULT '{}',
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Lab_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "templateCode" TEXT,
    "name" TEXT NOT NULL,
    "category" "LabItemCategory" NOT NULL,
    "kind" "LabItemKind" NOT NULL,
    "unit" TEXT NOT NULL,
    "requiredQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reorderLevel" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "storageLocation" TEXT,
    "hazards" TEXT[],
    "expiresOn" DATE,
    "msdsKey" TEXT,
    "unitCostMinor" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "LabItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabStockMovement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "type" "LabMovementType" NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "balanceAfter" DOUBLE PRECISION NOT NULL,
    "unitCostMinor" INTEGER NOT NULL DEFAULT 0,
    "sessionId" TEXT,
    "studentId" TEXT,
    "chargeMinor" INTEGER,
    "vendorName" TEXT,
    "invoiceNo" TEXT,
    "reason" TEXT,
    "actorId" TEXT,
    "actorLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabStockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabExperiment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "labType" "LabType" NOT NULL,
    "templateCode" TEXT,
    "classNumber" INTEGER,
    "subject" TEXT,
    "title" TEXT NOT NULL,
    "aim" TEXT,
    "apparatus" JSONB NOT NULL DEFAULT '[]',
    "safetyNotes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "LabExperiment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "experimentId" TEXT,
    "sectionId" TEXT,
    "teacherStaffId" TEXT,
    "date" DATE NOT NULL,
    "periodId" TEXT,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "batch" TEXT,
    "status" "LabSessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabSessionStudent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "present" BOOLEAN NOT NULL DEFAULT true,
    "recordDone" BOOLEAN NOT NULL DEFAULT false,
    "marks" DOUBLE PRECISION,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabSessionStudent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabInspection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "type" "LabInspectionType" NOT NULL,
    "inspectedOn" DATE NOT NULL,
    "checklist" JSONB NOT NULL DEFAULT '{}',
    "passed" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "issues" TEXT,
    "inspectorName" TEXT,
    "photoKeys" TEXT[],
    "nextDueOn" DATE,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabInspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabIncident" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "type" "LabIncidentType" NOT NULL,
    "severity" "LabIncidentSeverity" NOT NULL,
    "description" TEXT NOT NULL,
    "studentIds" TEXT[],
    "firstAidGiven" BOOLEAN NOT NULL DEFAULT false,
    "parentInformed" BOOLEAN NOT NULL DEFAULT false,
    "actionTaken" TEXT,
    "status" "LabIncidentStatus" NOT NULL DEFAULT 'OPEN',
    "photoKeys" TEXT[],
    "reportedById" TEXT,
    "reportedByLabel" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabWasteLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "disposedOn" DATE NOT NULL,
    "category" "LabWasteCategory" NOT NULL,
    "quantity" DOUBLE PRECISION,
    "unit" TEXT,
    "handedTo" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabWasteLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Lab_tenantId_deletedAt_idx" ON "Lab"("tenantId", "deletedAt");

-- CreateIndex
CREATE INDEX "LabItem_tenantId_labId_idx" ON "LabItem"("tenantId", "labId");

-- CreateIndex
CREATE INDEX "LabItem_tenantId_labId_templateCode_idx" ON "LabItem"("tenantId", "labId", "templateCode");

-- CreateIndex
CREATE INDEX "LabStockMovement_tenantId_labId_createdAt_idx" ON "LabStockMovement"("tenantId", "labId", "createdAt");

-- CreateIndex
CREATE INDEX "LabStockMovement_tenantId_itemId_createdAt_idx" ON "LabStockMovement"("tenantId", "itemId", "createdAt");

-- CreateIndex
CREATE INDEX "LabStockMovement_tenantId_type_createdAt_idx" ON "LabStockMovement"("tenantId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "LabStockMovement_tenantId_studentId_idx" ON "LabStockMovement"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "LabExperiment_tenantId_labType_classNumber_idx" ON "LabExperiment"("tenantId", "labType", "classNumber");

-- CreateIndex
CREATE INDEX "LabSession_tenantId_labId_date_idx" ON "LabSession"("tenantId", "labId", "date");

-- CreateIndex
CREATE INDEX "LabSession_tenantId_sectionId_date_idx" ON "LabSession"("tenantId", "sectionId", "date");

-- CreateIndex
CREATE INDEX "LabSessionStudent_tenantId_studentId_idx" ON "LabSessionStudent"("tenantId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "LabSessionStudent_sessionId_studentId_key" ON "LabSessionStudent"("sessionId", "studentId");

-- CreateIndex
CREATE INDEX "LabInspection_tenantId_labId_type_inspectedOn_idx" ON "LabInspection"("tenantId", "labId", "type", "inspectedOn");

-- CreateIndex
CREATE INDEX "LabIncident_tenantId_labId_occurredAt_idx" ON "LabIncident"("tenantId", "labId", "occurredAt");

-- CreateIndex
CREATE INDEX "LabIncident_tenantId_status_idx" ON "LabIncident"("tenantId", "status");

-- CreateIndex
CREATE INDEX "LabWasteLog_tenantId_labId_disposedOn_idx" ON "LabWasteLog"("tenantId", "labId", "disposedOn");

-- AddForeignKey
ALTER TABLE "LabItem" ADD CONSTRAINT "LabItem_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabStockMovement" ADD CONSTRAINT "LabStockMovement_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabStockMovement" ADD CONSTRAINT "LabStockMovement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "LabItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabStockMovement" ADD CONSTRAINT "LabStockMovement_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LabSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabSession" ADD CONSTRAINT "LabSession_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabSession" ADD CONSTRAINT "LabSession_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "LabExperiment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabSessionStudent" ADD CONSTRAINT "LabSessionStudent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LabSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabInspection" ADD CONSTRAINT "LabInspection_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabIncident" ADD CONSTRAINT "LabIncident_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabWasteLog" ADD CONSTRAINT "LabWasteLog_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE CASCADE ON UPDATE CASCADE;
