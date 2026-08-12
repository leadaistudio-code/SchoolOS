-- CreateEnum
CREATE TYPE "AssessmentMode" AS ENUM ('OFFLINE', 'ONLINE', 'PRACTICE');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'EVALUATED');

-- CreateTable
CREATE TABLE "AssessmentAssignment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "classLevelId" TEXT,
    "sectionId" TEXT,
    "mode" "AssessmentMode" NOT NULL DEFAULT 'OFFLINE',
    "opensAt" TIMESTAMP(3) NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "minutesOverride" INTEGER,
    "shuffleQuestions" BOOLEAN NOT NULL DEFAULT false,
    "shuffleOptions" BOOLEAN NOT NULL DEFAULT false,
    "onePerScreen" BOOLEAN NOT NULL DEFAULT false,
    "allowBack" BOOLEAN NOT NULL DEFAULT true,
    "autoSubmit" BOOLEAN NOT NULL DEFAULT true,
    "attemptLimit" INTEGER NOT NULL DEFAULT 1,
    "showResultOnSubmit" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AssessmentAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentAttempt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "status" "AttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "autoSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "objectiveScore" DOUBLE PRECISION,
    "totalScore" DOUBLE PRECISION,
    "evaluatedById" TEXT,
    "evaluatedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "teacherComment" TEXT,

    CONSTRAINT "AssessmentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentAnswer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "assessmentQuestionId" TEXT NOT NULL,
    "responseText" TEXT,
    "selectedIndexes" JSONB,
    "isCorrect" BOOLEAN,
    "marksAwarded" DOUBLE PRECISION,
    "teacherComment" TEXT,
    "evaluatedById" TEXT,
    "evaluatedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssessmentAssignment_tenantId_assessmentId_idx" ON "AssessmentAssignment"("tenantId", "assessmentId");

-- CreateIndex
CREATE INDEX "AssessmentAssignment_tenantId_sectionId_opensAt_idx" ON "AssessmentAssignment"("tenantId", "sectionId", "opensAt");

-- CreateIndex
CREATE INDEX "AssessmentAssignment_tenantId_dueAt_idx" ON "AssessmentAssignment"("tenantId", "dueAt");

-- CreateIndex
CREATE INDEX "AssessmentAttempt_tenantId_studentId_status_idx" ON "AssessmentAttempt"("tenantId", "studentId", "status");

-- CreateIndex
CREATE INDEX "AssessmentAttempt_tenantId_assignmentId_status_idx" ON "AssessmentAttempt"("tenantId", "assignmentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentAttempt_tenantId_assignmentId_studentId_attemptNu_key" ON "AssessmentAttempt"("tenantId", "assignmentId", "studentId", "attemptNumber");

-- CreateIndex
CREATE INDEX "StudentAnswer_tenantId_attemptId_idx" ON "StudentAnswer"("tenantId", "attemptId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentAnswer_tenantId_attemptId_assessmentQuestionId_key" ON "StudentAnswer"("tenantId", "attemptId", "assessmentQuestionId");

-- AddForeignKey
ALTER TABLE "AssessmentAssignment" ADD CONSTRAINT "AssessmentAssignment_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAssignment" ADD CONSTRAINT "AssessmentAssignment_classLevelId_fkey" FOREIGN KEY ("classLevelId") REFERENCES "ClassLevel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAssignment" ADD CONSTRAINT "AssessmentAssignment_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "AssessmentAttempt_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "AssessmentAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "AssessmentAttempt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentAnswer" ADD CONSTRAINT "StudentAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "AssessmentAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentAnswer" ADD CONSTRAINT "StudentAnswer_assessmentQuestionId_fkey" FOREIGN KEY ("assessmentQuestionId") REFERENCES "AssessmentQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

