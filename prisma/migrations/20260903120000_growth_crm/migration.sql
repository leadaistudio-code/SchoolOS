-- CreateEnum
CREATE TYPE "CrmStage" AS ENUM ('PROSPECT', 'CONTACTED', 'MEETING_SCHEDULED', 'DEMO_COMPLETED', 'FOLLOW_UP', 'PROPOSAL_SENT', 'NEGOTIATION', 'PILOT', 'WON', 'LOST', 'ON_HOLD', 'NOT_INTERESTED');

-- CreateEnum
CREATE TYPE "CrmTemperature" AS ENUM ('COLD', 'WARM', 'HOT');

-- CreateEnum
CREATE TYPE "CrmFollowUpStatus" AS ENUM ('PENDING', 'COMPLETED', 'RESCHEDULED', 'CANCELLED');

-- CreateTable
CREATE TABLE "CrmSchool" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "schoolType" TEXT,
    "board" TEXT,
    "studentCount" INTEGER,
    "branchCount" INTEGER,
    "city" TEXT,
    "state" TEXT,
    "address" TEXT,
    "website" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "currentErp" TEXT,
    "currentErpVendor" TEXT,
    "erpRenewalOn" DATE,
    "leadSource" TEXT,
    "campaign" TEXT,
    "sourceDetails" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "ownerId" TEXT,
    "createdById" TEXT,
    "temperature" "CrmTemperature" NOT NULL DEFAULT 'COLD',
    "temperatureManual" BOOLEAN NOT NULL DEFAULT false,
    "stage" "CrmStage" NOT NULL DEFAULT 'PROSPECT',
    "stageChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dealValueMinor" INTEGER NOT NULL DEFAULT 0,
    "arrMinor" INTEGER NOT NULL DEFAULT 0,
    "probability" INTEGER NOT NULL DEFAULT 10,
    "expectedCloseOn" DATE,
    "competitor" TEXT,
    "primaryObjection" TEXT,
    "budgetRange" TEXT,
    "decisionTimeline" TEXT,
    "nextFollowUpAt" TIMESTAMP(3),
    "nextAction" TEXT,
    "lastActivityAt" TIMESTAMP(3),
    "lostReason" TEXT,
    "lostCompetitor" TEXT,
    "lostNotes" TEXT,
    "recontactOn" DATE,
    "wonTenantId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CrmSchool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmContact" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "designation" TEXT,
    "mobile" TEXT,
    "whatsapp" TEXT,
    "email" TEXT,
    "preferredChannel" TEXT,
    "isDecisionMaker" BOOLEAN NOT NULL DEFAULT false,
    "isInfluencer" BOOLEAN NOT NULL DEFAULT false,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CrmContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmOpportunity" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'MyCampusView',
    "stage" "CrmStage" NOT NULL DEFAULT 'PROSPECT',
    "stageChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dealValueMinor" INTEGER NOT NULL DEFAULT 0,
    "arrMinor" INTEGER NOT NULL DEFAULT 0,
    "probability" INTEGER NOT NULL DEFAULT 10,
    "expectedCloseOn" DATE,
    "ownerId" TEXT,
    "lostReason" TEXT,
    "lostCompetitor" TEXT,
    "lostNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmOpportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmActivity" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "contactId" TEXT,
    "type" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "body" TEXT,
    "meta" JSONB,
    "actorId" TEXT,
    "actorLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmFollowUp" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "contactId" TEXT,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'CALL',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "note" TEXT,
    "status" "CrmFollowUpStatus" NOT NULL DEFAULT 'PENDING',
    "assignedToId" TEXT,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmFollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CrmSchool_stage_nextFollowUpAt_idx" ON "CrmSchool"("stage", "nextFollowUpAt");
CREATE INDEX "CrmSchool_ownerId_idx" ON "CrmSchool"("ownerId");
CREATE INDEX "CrmSchool_lastActivityAt_idx" ON "CrmSchool"("lastActivityAt");
CREATE INDEX "CrmSchool_leadSource_idx" ON "CrmSchool"("leadSource");
CREATE INDEX "CrmSchool_name_idx" ON "CrmSchool"("name");
CREATE INDEX "CrmSchool_city_idx" ON "CrmSchool"("city");
CREATE INDEX "CrmSchool_phone_idx" ON "CrmSchool"("phone");
CREATE INDEX "CrmSchool_wonTenantId_idx" ON "CrmSchool"("wonTenantId");

CREATE INDEX "CrmContact_schoolId_idx" ON "CrmContact"("schoolId");
CREATE INDEX "CrmContact_mobile_idx" ON "CrmContact"("mobile");
CREATE INDEX "CrmContact_email_idx" ON "CrmContact"("email");

CREATE INDEX "CrmOpportunity_stage_idx" ON "CrmOpportunity"("stage");
CREATE INDEX "CrmOpportunity_ownerId_idx" ON "CrmOpportunity"("ownerId");
CREATE INDEX "CrmOpportunity_schoolId_idx" ON "CrmOpportunity"("schoolId");

CREATE INDEX "CrmActivity_schoolId_createdAt_idx" ON "CrmActivity"("schoolId", "createdAt");
CREATE INDEX "CrmActivity_type_idx" ON "CrmActivity"("type");

CREATE INDEX "CrmFollowUp_dueAt_status_idx" ON "CrmFollowUp"("dueAt", "status");
CREATE INDEX "CrmFollowUp_schoolId_status_idx" ON "CrmFollowUp"("schoolId", "status");
CREATE INDEX "CrmFollowUp_assignedToId_status_idx" ON "CrmFollowUp"("assignedToId", "status");

-- AddForeignKey
ALTER TABLE "CrmSchool" ADD CONSTRAINT "CrmSchool_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmSchool" ADD CONSTRAINT "CrmSchool_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmContact" ADD CONSTRAINT "CrmContact_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "CrmSchool"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmOpportunity" ADD CONSTRAINT "CrmOpportunity_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "CrmSchool"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmOpportunity" ADD CONSTRAINT "CrmOpportunity_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "CrmSchool"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmFollowUp" ADD CONSTRAINT "CrmFollowUp_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "CrmSchool"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmFollowUp" ADD CONSTRAINT "CrmFollowUp_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "CrmContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmFollowUp" ADD CONSTRAINT "CrmFollowUp_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
