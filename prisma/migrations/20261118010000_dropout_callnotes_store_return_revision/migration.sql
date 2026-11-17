-- CreateEnum
CREATE TYPE "StoreReturnKind" AS ENUM ('RETURN', 'EXCHANGE');

-- CreateTable
CREATE TABLE "FeeCallNote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "contactLabel" TEXT,
    "calledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT NOT NULL,
    "createdById" TEXT,
    "createdByLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeeCallNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreReturn" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "kind" "StoreReturnKind" NOT NULL DEFAULT 'RETURN',
    "studentId" TEXT,
    "refundMinor" INTEGER NOT NULL DEFAULT 0,
    "refundMode" TEXT,
    "collectedMinor" INTEGER NOT NULL DEFAULT 0,
    "collectedMode" TEXT,
    "exchangeSaleId" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdByLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreReturnLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "saleLineId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "unitCostMinor" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StoreReturnLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevisionPlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "classLevelId" TEXT,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "notes" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdByLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RevisionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevisionSlot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "periodLabel" TEXT,
    "classLevelId" TEXT NOT NULL,
    "sectionId" TEXT,
    "subjectId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "teacherStaffId" TEXT,
    "room" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RevisionSlot_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN "returnId" TEXT;

-- CreateIndex
CREATE INDEX "FeeCallNote_tenantId_studentId_calledAt_idx" ON "FeeCallNote"("tenantId", "studentId", "calledAt");
CREATE INDEX "FeeCallNote_tenantId_calledAt_idx" ON "FeeCallNote"("tenantId", "calledAt");

CREATE UNIQUE INDEX "StoreReturn_tenantId_number_key" ON "StoreReturn"("tenantId", "number");
CREATE UNIQUE INDEX "StoreReturn_exchangeSaleId_key" ON "StoreReturn"("exchangeSaleId");
CREATE INDEX "StoreReturn_tenantId_saleId_idx" ON "StoreReturn"("tenantId", "saleId");
CREATE INDEX "StoreReturn_tenantId_createdAt_idx" ON "StoreReturn"("tenantId", "createdAt");
CREATE INDEX "StoreReturn_tenantId_studentId_idx" ON "StoreReturn"("tenantId", "studentId");

CREATE INDEX "StoreReturnLine_tenantId_returnId_idx" ON "StoreReturnLine"("tenantId", "returnId");
CREATE INDEX "StoreReturnLine_tenantId_saleLineId_idx" ON "StoreReturnLine"("tenantId", "saleLineId");
CREATE INDEX "StoreReturnLine_tenantId_itemId_idx" ON "StoreReturnLine"("tenantId", "itemId");

CREATE INDEX "RevisionPlan_tenantId_sessionId_startsOn_idx" ON "RevisionPlan"("tenantId", "sessionId", "startsOn");
CREATE INDEX "RevisionPlan_tenantId_classLevelId_idx" ON "RevisionPlan"("tenantId", "classLevelId");
CREATE INDEX "RevisionPlan_tenantId_publishedAt_idx" ON "RevisionPlan"("tenantId", "publishedAt");

CREATE INDEX "RevisionSlot_tenantId_planId_date_idx" ON "RevisionSlot"("tenantId", "planId", "date");
CREATE INDEX "RevisionSlot_tenantId_classLevelId_date_idx" ON "RevisionSlot"("tenantId", "classLevelId", "date");
CREATE INDEX "RevisionSlot_tenantId_subjectId_date_idx" ON "RevisionSlot"("tenantId", "subjectId", "date");
CREATE INDEX "RevisionSlot_tenantId_teacherStaffId_date_idx" ON "RevisionSlot"("tenantId", "teacherStaffId", "date");

CREATE INDEX "StockMovement_tenantId_returnId_idx" ON "StockMovement"("tenantId", "returnId");

-- AddForeignKey
ALTER TABLE "FeeCallNote" ADD CONSTRAINT "FeeCallNote_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StoreReturn" ADD CONSTRAINT "StoreReturn_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "StoreSale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StoreReturn" ADD CONSTRAINT "StoreReturn_exchangeSaleId_fkey" FOREIGN KEY ("exchangeSaleId") REFERENCES "StoreSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StoreReturn" ADD CONSTRAINT "StoreReturn_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StoreReturnLine" ADD CONSTRAINT "StoreReturnLine_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "StoreReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoreReturnLine" ADD CONSTRAINT "StoreReturnLine_saleLineId_fkey" FOREIGN KEY ("saleLineId") REFERENCES "StoreSaleLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StoreReturnLine" ADD CONSTRAINT "StoreReturnLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "StoreItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RevisionPlan" ADD CONSTRAINT "RevisionPlan_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AcademicSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RevisionPlan" ADD CONSTRAINT "RevisionPlan_classLevelId_fkey" FOREIGN KEY ("classLevelId") REFERENCES "ClassLevel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RevisionSlot" ADD CONSTRAINT "RevisionSlot_planId_fkey" FOREIGN KEY ("planId") REFERENCES "RevisionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RevisionSlot" ADD CONSTRAINT "RevisionSlot_classLevelId_fkey" FOREIGN KEY ("classLevelId") REFERENCES "ClassLevel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RevisionSlot" ADD CONSTRAINT "RevisionSlot_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RevisionSlot" ADD CONSTRAINT "RevisionSlot_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RevisionSlot" ADD CONSTRAINT "RevisionSlot_teacherStaffId_fkey" FOREIGN KEY ("teacherStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
