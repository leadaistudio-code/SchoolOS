-- CreateEnum
CREATE TYPE "TeacherRefreshFrequency" AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ProficiencyLevel" AS ENUM ('STRONG', 'GOOD', 'REFRESH_RECOMMENDED', 'DEVELOPING');

-- CreateEnum
CREATE TYPE "TeacherRefreshType" AS ENUM ('WEEKLY', 'MONTHLY', 'PRE_LECTURE', 'MANUAL');

-- CreateEnum
CREATE TYPE "TeacherRefreshStatus" AS ENUM ('PENDING', 'COMPLETED', 'OVERDUE', 'EXEMPTED');

-- CreateTable
CREATE TABLE "TeacherRefreshConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "frequency" "TeacherRefreshFrequency" NOT NULL DEFAULT 'WEEKLY',
    "weeklyQuestionCount" INTEGER NOT NULL DEFAULT 10,
    "monthlyQuestionCount" INTEGER NOT NULL DEFAULT 25,
    "passingThreshold" DOUBLE PRECISION NOT NULL DEFAULT 70.0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 2,
    "preLectureEnabled" BOOLEAN NOT NULL DEFAULT true,
    "preLectureCount" INTEGER NOT NULL DEFAULT 5,
    "completionWindowHours" INTEGER NOT NULL DEFAULT 48,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeacherRefreshConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherKnowledgeProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "proficiency" "ProficiencyLevel" NOT NULL DEFAULT 'GOOD',
    "lastTestedAt" TIMESTAMP(3),
    "history" JSONB,

    CONSTRAINT "TeacherKnowledgeProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherRefreshAssessment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "classSubjectId" TEXT NOT NULL,
    "type" "TeacherRefreshType" NOT NULL,
    "status" "TeacherRefreshStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "questionCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeacherRefreshAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherRefreshQuestion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TeacherRefreshQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherRefreshAttempt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "score" DOUBLE PRECISION,
    "maxScore" DOUBLE PRECISION,
    "topicBreakdown" JSONB,
    "feedback" JSONB,

    CONSTRAINT "TeacherRefreshAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherRefreshAttemptAnswer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "refreshQuestionId" TEXT NOT NULL,
    "selectedIndexes" JSONB,
    "responseText" TEXT,
    "isCorrect" BOOLEAN,

    CONSTRAINT "TeacherRefreshAttemptAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TeacherRefreshConfig_tenantId_key" ON "TeacherRefreshConfig"("tenantId");

-- CreateIndex
CREATE INDEX "TeacherKnowledgeProfile_tenantId_teacherId_idx" ON "TeacherKnowledgeProfile"("tenantId", "teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherKnowledgeProfile_tenantId_teacherId_topicId_key" ON "TeacherKnowledgeProfile"("tenantId", "teacherId", "topicId");

-- CreateIndex
CREATE INDEX "TeacherRefreshAssessment_tenantId_teacherId_status_idx" ON "TeacherRefreshAssessment"("tenantId", "teacherId", "status");

-- CreateIndex
CREATE INDEX "TeacherRefreshAssessment_tenantId_dueAt_idx" ON "TeacherRefreshAssessment"("tenantId", "dueAt");

-- CreateIndex
CREATE INDEX "TeacherRefreshQuestion_tenantId_assessmentId_position_idx" ON "TeacherRefreshQuestion"("tenantId", "assessmentId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherRefreshQuestion_tenantId_assessmentId_questionId_key" ON "TeacherRefreshQuestion"("tenantId", "assessmentId", "questionId");

-- CreateIndex
CREATE INDEX "TeacherRefreshAttempt_tenantId_assessmentId_idx" ON "TeacherRefreshAttempt"("tenantId", "assessmentId");

-- CreateIndex
CREATE INDEX "TeacherRefreshAttempt_tenantId_teacherId_idx" ON "TeacherRefreshAttempt"("tenantId", "teacherId");

-- CreateIndex
CREATE INDEX "TeacherRefreshAttemptAnswer_tenantId_attemptId_idx" ON "TeacherRefreshAttemptAnswer"("tenantId", "attemptId");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherRefreshAttemptAnswer_tenantId_attemptId_refreshQuest_key" ON "TeacherRefreshAttemptAnswer"("tenantId", "attemptId", "refreshQuestionId");

-- AddForeignKey
ALTER TABLE "TeacherKnowledgeProfile" ADD CONSTRAINT "TeacherKnowledgeProfile_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherKnowledgeProfile" ADD CONSTRAINT "TeacherKnowledgeProfile_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherRefreshAssessment" ADD CONSTRAINT "TeacherRefreshAssessment_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherRefreshAssessment" ADD CONSTRAINT "TeacherRefreshAssessment_classSubjectId_fkey" FOREIGN KEY ("classSubjectId") REFERENCES "ClassSubject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherRefreshQuestion" ADD CONSTRAINT "TeacherRefreshQuestion_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "TeacherRefreshAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherRefreshQuestion" ADD CONSTRAINT "TeacherRefreshQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherRefreshAttempt" ADD CONSTRAINT "TeacherRefreshAttempt_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "TeacherRefreshAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherRefreshAttempt" ADD CONSTRAINT "TeacherRefreshAttempt_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherRefreshAttemptAnswer" ADD CONSTRAINT "TeacherRefreshAttemptAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "TeacherRefreshAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherRefreshAttemptAnswer" ADD CONSTRAINT "TeacherRefreshAttemptAnswer_refreshQuestionId_fkey" FOREIGN KEY ("refreshQuestionId") REFERENCES "TeacherRefreshQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
