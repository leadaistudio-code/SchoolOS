-- CreateEnum
CREATE TYPE "CrmMeetingStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CrmTaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "CrmVisit" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "visitedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "teamMembers" TEXT,
    "contactsMet" TEXT,
    "purpose" TEXT,
    "meetingType" TEXT,
    "summary" TEXT NOT NULL,
    "painPoints" TEXT,
    "currentErp" TEXT,
    "liked" TEXT,
    "objections" TEXT,
    "competitors" TEXT,
    "outcome" TEXT,
    "nextAction" TEXT,
    "documentsRequested" TEXT,
    "dealConfidence" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmMeeting" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "meetingType" TEXT NOT NULL DEFAULT 'Discovery',
    "mode" TEXT NOT NULL DEFAULT 'PHYSICAL',
    "location" TEXT,
    "meetingLink" TEXT,
    "agenda" TEXT,
    "notes" TEXT,
    "contactIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "attendeeIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "CrmMeetingStatus" NOT NULL DEFAULT 'SCHEDULED',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmTask" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "contactId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueAt" TIMESTAMP(3),
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" "CrmTaskStatus" NOT NULL DEFAULT 'TODO',
    "ownerId" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmReminderSend" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "targetKey" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmReminderSend_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CrmVisit_schoolId_visitedAt_idx" ON "CrmVisit"("schoolId", "visitedAt");
CREATE INDEX "CrmVisit_visitedAt_idx" ON "CrmVisit"("visitedAt");

CREATE INDEX "CrmMeeting_startsAt_status_idx" ON "CrmMeeting"("startsAt", "status");
CREATE INDEX "CrmMeeting_schoolId_status_idx" ON "CrmMeeting"("schoolId", "status");

CREATE INDEX "CrmTask_dueAt_status_idx" ON "CrmTask"("dueAt", "status");
CREATE INDEX "CrmTask_schoolId_status_idx" ON "CrmTask"("schoolId", "status");
CREATE INDEX "CrmTask_ownerId_status_idx" ON "CrmTask"("ownerId", "status");

CREATE UNIQUE INDEX "CrmReminderSend_kind_targetKey_key" ON "CrmReminderSend"("kind", "targetKey");
CREATE INDEX "CrmReminderSend_sentAt_idx" ON "CrmReminderSend"("sentAt");

ALTER TABLE "CrmVisit" ADD CONSTRAINT "CrmVisit_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "CrmSchool"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmVisit" ADD CONSTRAINT "CrmVisit_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CrmMeeting" ADD CONSTRAINT "CrmMeeting_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "CrmSchool"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmMeeting" ADD CONSTRAINT "CrmMeeting_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CrmTask" ADD CONSTRAINT "CrmTask_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "CrmSchool"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmTask" ADD CONSTRAINT "CrmTask_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "CrmContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmTask" ADD CONSTRAINT "CrmTask_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
