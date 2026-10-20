-- Tapasya Mode: study sessions, Pomodoro, XP ledger, guardian exceptions and the
-- global leaderboard projection. Additive only: no existing table or column changes
-- apart from new foreign keys pointing at Student, Homework and User.
-- Rollback script: docs/tapasya/rollback.sql

-- CreateEnum
CREATE TYPE "TapasyaTaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TapasyaTaskCategory" AS ENUM ('HOMEWORK', 'CHAPTER', 'REVISION', 'PERSONAL', 'TEACHER_GOAL', 'OTHER');

-- CreateEnum
CREATE TYPE "TapasyaSessionState" AS ENUM ('READY', 'FOCUS_ACTIVE', 'FOCUS_PAUSED', 'BREAK_ACTIVE', 'COMPLETED', 'CANCELLED', 'INTERRUPTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "TapasyaRestrictionLevel" AS ENUM ('TIMER_ONLY', 'PARTIAL', 'APP_SHIELDING', 'MANAGED_KIOSK');

-- CreateEnum
CREATE TYPE "TapasyaXpStatus" AS ENUM ('PENDING', 'VALIDATED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TapasyaUnlockStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED', 'DELIVERY_FAILED');

-- CreateEnum
CREATE TYPE "GlobalProfileStatus" AS ENUM ('PENDING_GUARDIAN', 'ACTIVE', 'OPTED_OUT', 'SCHOOL_DISABLED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "GlobalLeaderboardPeriod" AS ENUM ('ALL_TIME', 'DAILY', 'WEEKLY', 'MONTHLY', 'SEASON');

-- AlterTable

-- CreateTable
CREATE TABLE "TapasyaSchoolPolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "globalLeaderboardAllowed" BOOLEAN NOT NULL DEFAULT true,
    "schoolLeaderboardEnabled" BOOLEAN NOT NULL DEFAULT false,
    "minFocusMinutes" INTEGER NOT NULL DEFAULT 10,
    "maxFocusMinutes" INTEGER NOT NULL DEFAULT 90,
    "minBreakMinutes" INTEGER NOT NULL DEFAULT 2,
    "maxBreakMinutes" INTEGER NOT NULL DEFAULT 30,
    "allowPause" BOOLEAN NOT NULL DEFAULT true,
    "allowSkipBreak" BOOLEAN NOT NULL DEFAULT true,
    "maxUnlockMinutes" INTEGER NOT NULL DEFAULT 15,
    "maxUnlockRequestsPerDay" INTEGER NOT NULL DEFAULT 5,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TapasyaSchoolPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TapasyaPreset" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "focusMinutes" INTEGER NOT NULL,
    "shortBreakMinutes" INTEGER NOT NULL,
    "longBreakMinutes" INTEGER,
    "cyclesBeforeLongBreak" INTEGER NOT NULL DEFAULT 4,
    "autoStartBreak" BOOLEAN NOT NULL DEFAULT true,
    "autoStartFocus" BOOLEAN NOT NULL DEFAULT false,
    "allowPause" BOOLEAN NOT NULL DEFAULT true,
    "allowSkipBreak" BOOLEAN NOT NULL DEFAULT true,
    "soundEnabled" BOOLEAN NOT NULL DEFAULT true,
    "hapticsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "sourceKey" TEXT,
    "sourceVersion" INTEGER,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TapasyaPreset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TapasyaTask" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "subject" TEXT,
    "category" "TapasyaTaskCategory" NOT NULL DEFAULT 'PERSONAL',
    "difficulty" INTEGER NOT NULL DEFAULT 3,
    "importance" INTEGER NOT NULL DEFAULT 3,
    "urgency" INTEGER NOT NULL DEFAULT 3,
    "estimatedMinutes" INTEGER NOT NULL DEFAULT 25,
    "dueOn" DATE,
    "createdByUserId" TEXT NOT NULL,
    "assignedByStaffId" TEXT,
    "isTeacherAssigned" BOOLEAN NOT NULL DEFAULT false,
    "isMandatory" BOOLEAN NOT NULL DEFAULT false,
    "teacherInstructions" TEXT,
    "studentCanEdit" BOOLEAN NOT NULL DEFAULT true,
    "requiredFocusMinutes" INTEGER,
    "requiredBreakMinutes" INTEGER,
    "homeworkId" TEXT,
    "status" "TapasyaTaskStatus" NOT NULL DEFAULT 'TODO',
    "frogOn" DATE,
    "isPrimaryFrog" BOOLEAN NOT NULL DEFAULT false,
    "actualMinutes" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "reflection" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "TapasyaTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TapasyaFocusSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT,
    "presetId" TEXT,
    "settings" JSONB NOT NULL,
    "policySource" TEXT NOT NULL,
    "state" "TapasyaSessionState" NOT NULL DEFAULT 'READY',
    "plannedCycles" INTEGER NOT NULL DEFAULT 1,
    "completedCycles" INTEGER NOT NULL DEFAULT 0,
    "currentCycle" INTEGER NOT NULL DEFAULT 1,
    "phaseStartedAt" TIMESTAMP(3),
    "phaseEndsAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "phasePausedMs" INTEGER NOT NULL DEFAULT 0,
    "phasePauseCount" INTEGER NOT NULL DEFAULT 0,
    "totalFocusMs" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "endReason" TEXT,
    "clientSessionKey" TEXT NOT NULL,
    "activeLock" TEXT,
    "restrictionLevel" "TapasyaRestrictionLevel" NOT NULL DEFAULT 'TIMER_ONLY',
    "restrictionDetail" JSONB,
    "deviceId" TEXT,
    "offlineSynced" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TapasyaFocusSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TapasyaFocusInterval" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cycleIndex" INTEGER NOT NULL,
    "plannedMinutes" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,
    "focusMs" INTEGER NOT NULL,
    "pauseCount" INTEGER NOT NULL DEFAULT 0,
    "outcome" TEXT NOT NULL,
    "restrictionLevel" "TapasyaRestrictionLevel" NOT NULL DEFAULT 'TIMER_ONLY',
    "offlineSynced" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TapasyaFocusInterval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TapasyaSessionEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "clientEventId" TEXT NOT NULL,
    "serverAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientAt" TIMESTAMP(3),
    "fromState" TEXT,
    "toState" TEXT,
    "detail" JSONB,

    CONSTRAINT "TapasyaSessionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TapasyaDevice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "osVersion" TEXT,
    "appVersion" TEXT,
    "capabilityState" TEXT NOT NULL,
    "capabilities" JSONB NOT NULL,
    "managed" BOOLEAN NOT NULL DEFAULT false,
    "lastReportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TapasyaDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TapasyaUnlockRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "sessionId" TEXT,
    "deviceId" TEXT,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "requestedMinutes" INTEGER NOT NULL,
    "status" "TapasyaUnlockStatus" NOT NULL DEFAULT 'PENDING',
    "codeHash" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "guardianUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "deliveryChannel" TEXT,
    "deliveryError" TEXT,
    "decidedByUserId" TEXT,
    "decidedVia" TEXT,
    "decidedAt" TIMESTAMP(3),
    "grantStartsAt" TIMESTAMP(3),
    "grantEndsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TapasyaUnlockRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TapasyaXpEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "points" INTEGER NOT NULL,
    "scoringVersion" INTEGER NOT NULL,
    "status" "TapasyaXpStatus" NOT NULL DEFAULT 'VALIDATED',
    "rejectionReason" TEXT,
    "restrictionLevel" "TapasyaRestrictionLevel",
    "flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "idempotencyKey" TEXT NOT NULL,
    "correctsId" TEXT,
    "correctionReason" TEXT,
    "actorUserId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TapasyaXpEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TapasyaUserAchievement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "achievementKey" TEXT NOT NULL,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TapasyaUserAchievement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlobalScoringConfig" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "rules" JSONB NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GlobalScoringConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlobalLeaderboardSeason" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GlobalLeaderboardSeason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlobalLeaderboardProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "aliasKey" TEXT NOT NULL,
    "avatarKey" TEXT NOT NULL DEFAULT 'lotus',
    "showBadges" BOOLEAN NOT NULL DEFAULT true,
    "division" TEXT,
    "status" "GlobalProfileStatus" NOT NULL DEFAULT 'PENDING_GUARDIAN',
    "consentByUserId" TEXT,
    "consentAt" TIMESTAMP(3),
    "optedOutAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlobalLeaderboardProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlobalLeaderboardEntry" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "period" "GlobalLeaderboardPeriod" NOT NULL,
    "periodKey" TEXT NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "intervals" INTEGER NOT NULL DEFAULT 0,
    "reachedAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlobalLeaderboardEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlobalLeaderboardSnapshot" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "period" "GlobalLeaderboardPeriod" NOT NULL,
    "periodKey" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "xp" INTEGER NOT NULL,
    "takenOn" DATE NOT NULL,

    CONSTRAINT "GlobalLeaderboardSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlobalTapasyaSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlobalTapasyaSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "TapasyaSchoolPolicy_tenantId_key" ON "TapasyaSchoolPolicy"("tenantId");

-- CreateIndex
CREATE INDEX "TapasyaPreset_tenantId_ownerUserId_archivedAt_idx" ON "TapasyaPreset"("tenantId", "ownerUserId", "archivedAt");

-- CreateIndex
CREATE INDEX "TapasyaTask_tenantId_studentId_status_idx" ON "TapasyaTask"("tenantId", "studentId", "status");

-- CreateIndex
CREATE INDEX "TapasyaTask_tenantId_studentId_frogOn_idx" ON "TapasyaTask"("tenantId", "studentId", "frogOn");

-- CreateIndex
CREATE INDEX "TapasyaTask_tenantId_assignedByStaffId_idx" ON "TapasyaTask"("tenantId", "assignedByStaffId");

-- CreateIndex
CREATE UNIQUE INDEX "TapasyaFocusSession_activeLock_key" ON "TapasyaFocusSession"("activeLock");

-- CreateIndex
CREATE INDEX "TapasyaFocusSession_tenantId_studentId_startedAt_idx" ON "TapasyaFocusSession"("tenantId", "studentId", "startedAt");

-- CreateIndex
CREATE INDEX "TapasyaFocusSession_tenantId_state_idx" ON "TapasyaFocusSession"("tenantId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "TapasyaFocusSession_tenantId_userId_clientSessionKey_key" ON "TapasyaFocusSession"("tenantId", "userId", "clientSessionKey");

-- CreateIndex
CREATE INDEX "TapasyaFocusInterval_tenantId_userId_startedAt_idx" ON "TapasyaFocusInterval"("tenantId", "userId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TapasyaFocusInterval_sessionId_cycleIndex_key" ON "TapasyaFocusInterval"("sessionId", "cycleIndex");

-- CreateIndex
CREATE INDEX "TapasyaSessionEvent_tenantId_sessionId_serverAt_idx" ON "TapasyaSessionEvent"("tenantId", "sessionId", "serverAt");

-- CreateIndex
CREATE UNIQUE INDEX "TapasyaSessionEvent_sessionId_clientEventId_key" ON "TapasyaSessionEvent"("sessionId", "clientEventId");

-- CreateIndex
CREATE INDEX "TapasyaDevice_tenantId_userId_idx" ON "TapasyaDevice"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "TapasyaDevice_tenantId_userId_installationId_key" ON "TapasyaDevice"("tenantId", "userId", "installationId");

-- CreateIndex
CREATE INDEX "TapasyaUnlockRequest_tenantId_studentId_status_idx" ON "TapasyaUnlockRequest"("tenantId", "studentId", "status");

-- CreateIndex
CREATE INDEX "TapasyaUnlockRequest_tenantId_status_expiresAt_idx" ON "TapasyaUnlockRequest"("tenantId", "status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "TapasyaUnlockRequest_tenantId_requestedByUserId_idempotency_key" ON "TapasyaUnlockRequest"("tenantId", "requestedByUserId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "TapasyaXpEvent_tenantId_userId_occurredAt_idx" ON "TapasyaXpEvent"("tenantId", "userId", "occurredAt");

-- CreateIndex
CREATE INDEX "TapasyaXpEvent_tenantId_status_occurredAt_idx" ON "TapasyaXpEvent"("tenantId", "status", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "TapasyaXpEvent_tenantId_idempotencyKey_key" ON "TapasyaXpEvent"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "TapasyaUserAchievement_tenantId_userId_idx" ON "TapasyaUserAchievement"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "TapasyaUserAchievement_tenantId_userId_achievementKey_key" ON "TapasyaUserAchievement"("tenantId", "userId", "achievementKey");

-- CreateIndex
CREATE UNIQUE INDEX "GlobalScoringConfig_version_key" ON "GlobalScoringConfig"("version");

-- CreateIndex
CREATE INDEX "GlobalScoringConfig_effectiveFrom_idx" ON "GlobalScoringConfig"("effectiveFrom");

-- CreateIndex
CREATE INDEX "GlobalLeaderboardSeason_startsAt_endsAt_idx" ON "GlobalLeaderboardSeason"("startsAt", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "GlobalLeaderboardProfile_userId_key" ON "GlobalLeaderboardProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GlobalLeaderboardProfile_aliasKey_key" ON "GlobalLeaderboardProfile"("aliasKey");

-- CreateIndex
CREATE INDEX "GlobalLeaderboardProfile_tenantId_status_idx" ON "GlobalLeaderboardProfile"("tenantId", "status");

-- CreateIndex
CREATE INDEX "GlobalLeaderboardEntry_period_periodKey_xp_reachedAt_idx" ON "GlobalLeaderboardEntry"("period", "periodKey", "xp" DESC, "reachedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GlobalLeaderboardEntry_profileId_period_periodKey_key" ON "GlobalLeaderboardEntry"("profileId", "period", "periodKey");

-- CreateIndex
CREATE INDEX "GlobalLeaderboardSnapshot_period_periodKey_takenOn_idx" ON "GlobalLeaderboardSnapshot"("period", "periodKey", "takenOn");

-- CreateIndex
CREATE UNIQUE INDEX "GlobalLeaderboardSnapshot_profileId_period_periodKey_takenO_key" ON "GlobalLeaderboardSnapshot"("profileId", "period", "periodKey", "takenOn");

-- AddForeignKey
ALTER TABLE "TapasyaTask" ADD CONSTRAINT "TapasyaTask_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TapasyaTask" ADD CONSTRAINT "TapasyaTask_homeworkId_fkey" FOREIGN KEY ("homeworkId") REFERENCES "Homework"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TapasyaFocusSession" ADD CONSTRAINT "TapasyaFocusSession_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TapasyaFocusSession" ADD CONSTRAINT "TapasyaFocusSession_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "TapasyaTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TapasyaFocusSession" ADD CONSTRAINT "TapasyaFocusSession_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "TapasyaPreset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TapasyaFocusInterval" ADD CONSTRAINT "TapasyaFocusInterval_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TapasyaFocusSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TapasyaSessionEvent" ADD CONSTRAINT "TapasyaSessionEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TapasyaFocusSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TapasyaUnlockRequest" ADD CONSTRAINT "TapasyaUnlockRequest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TapasyaXpEvent" ADD CONSTRAINT "TapasyaXpEvent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GlobalLeaderboardProfile" ADD CONSTRAINT "GlobalLeaderboardProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GlobalLeaderboardEntry" ADD CONSTRAINT "GlobalLeaderboardEntry_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "GlobalLeaderboardProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
