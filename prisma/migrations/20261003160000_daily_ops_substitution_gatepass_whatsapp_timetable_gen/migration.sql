-- CreateEnum
CREATE TYPE "SubstitutionStatus" AS ENUM ('OPEN', 'ASSIGNED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GatePassStatus" AS ENUM ('AWAITING_OTP', 'APPROVED', 'EXITED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ParentQueryStatus" AS ENUM ('OPEN', 'RESOLVED');

-- AlterTable
ALTER TABLE "ClassSubject" ADD COLUMN     "doublePeriod" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxPerDay" INTEGER,
ADD COLUMN     "periodsPerWeek" INTEGER;

-- AlterTable
ALTER TABLE "Staff" ADD COLUMN     "timetableMaxPerDay" INTEGER,
ADD COLUMN     "timetableUnavailable" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "Substitution" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "onDate" DATE NOT NULL,
    "sectionId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "classSubjectId" TEXT,
    "absentTeacherId" TEXT NOT NULL,
    "substituteId" TEXT,
    "status" "SubstitutionStatus" NOT NULL DEFAULT 'OPEN',
    "reason" TEXT,
    "note" TEXT,
    "notifiedAt" TIMESTAMP(3),
    "assignedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Substitution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GatePass" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "passNumber" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "pickupName" TEXT NOT NULL,
    "pickupRelation" TEXT,
    "pickupPhone" TEXT,
    "guardianId" TEXT,
    "verification" TEXT,
    "otpHash" TEXT,
    "otpExpiresAt" TIMESTAMP(3),
    "otpAttempts" INTEGER NOT NULL DEFAULT 0,
    "otpSentTo" TEXT,
    "status" "GatePassStatus" NOT NULL DEFAULT 'AWAITING_OTP',
    "issuedById" TEXT,
    "issuedByLabel" TEXT,
    "approvedAt" TIMESTAMP(3),
    "exitedAt" TIMESTAMP(3),
    "exitedByLabel" TEXT,
    "parentNotifiedAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GatePass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParentQuery" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "parentId" TEXT,
    "studentId" TEXT,
    "phone" TEXT NOT NULL,
    "senderName" TEXT,
    "message" TEXT NOT NULL,
    "status" "ParentQueryStatus" NOT NULL DEFAULT 'OPEN',
    "reply" TEXT,
    "repliedAt" TIMESTAMP(3),
    "repliedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParentQuery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppBotSession" (
    "phone" TEXT NOT NULL,
    "schoolTenant" TEXT,
    "studentId" TEXT,
    "awaiting" TEXT,
    "lastInboundAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppBotSession_pkey" PRIMARY KEY ("phone")
);

-- CreateIndex
CREATE INDEX "Substitution_tenantId_onDate_idx" ON "Substitution"("tenantId", "onDate");

-- CreateIndex
CREATE INDEX "Substitution_tenantId_substituteId_onDate_idx" ON "Substitution"("tenantId", "substituteId", "onDate");

-- CreateIndex
CREATE UNIQUE INDEX "Substitution_tenantId_onDate_sectionId_periodId_key" ON "Substitution"("tenantId", "onDate", "sectionId", "periodId");

-- CreateIndex
CREATE UNIQUE INDEX "GatePass_token_key" ON "GatePass"("token");

-- CreateIndex
CREATE INDEX "GatePass_tenantId_createdAt_idx" ON "GatePass"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "GatePass_tenantId_studentId_idx" ON "GatePass"("tenantId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "GatePass_tenantId_passNumber_key" ON "GatePass"("tenantId", "passNumber");

-- CreateIndex
CREATE INDEX "ParentQuery_tenantId_status_createdAt_idx" ON "ParentQuery"("tenantId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "Substitution" ADD CONSTRAINT "Substitution_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Substitution" ADD CONSTRAINT "Substitution_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "TimetablePeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Substitution" ADD CONSTRAINT "Substitution_classSubjectId_fkey" FOREIGN KEY ("classSubjectId") REFERENCES "ClassSubject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Substitution" ADD CONSTRAINT "Substitution_absentTeacherId_fkey" FOREIGN KEY ("absentTeacherId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Substitution" ADD CONSTRAINT "Substitution_substituteId_fkey" FOREIGN KEY ("substituteId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GatePass" ADD CONSTRAINT "GatePass_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GatePass" ADD CONSTRAINT "GatePass_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "Parent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentQuery" ADD CONSTRAINT "ParentQuery_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Parent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentQuery" ADD CONSTRAINT "ParentQuery_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;
