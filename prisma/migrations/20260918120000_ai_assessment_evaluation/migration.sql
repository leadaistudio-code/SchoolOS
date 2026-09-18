-- Academic Intelligence: answer sheets + async AI evaluation jobs
-- Extends Assessments; does not alter StudentAnswer / Mark / Result.

CREATE TYPE "AnswerSheetStatus" AS ENUM (
  'UPLOADED',
  'QUEUED',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'REVIEW_REQUIRED'
);

CREATE TYPE "EvaluationJobStatus" AS ENUM (
  'QUEUED',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'REVIEW_REQUIRED'
);

CREATE TYPE "EvaluatedAnswerReviewStatus" AS ENUM (
  'PENDING',
  'APPROVED',
  'OVERRIDDEN',
  'FLAGGED'
);

CREATE TABLE "AnswerSheet" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "attemptId" TEXT,
  "storageKey" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "pageCount" INTEGER NOT NULL DEFAULT 1,
  "status" "AnswerSheetStatus" NOT NULL DEFAULT 'UPLOADED',
  "uploadedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AnswerSheet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EvaluationJob" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "answerSheetId" TEXT NOT NULL,
  "workerJobId" TEXT,
  "status" "EvaluationJobStatus" NOT NULL DEFAULT 'QUEUED',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "lastError" TEXT,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "usage" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EvaluationJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EvaluatedAnswer" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "evaluationJobId" TEXT NOT NULL,
  "assessmentQuestionId" TEXT,
  "questionNumber" INTEGER,
  "extractedText" TEXT,
  "ocrConfidence" DOUBLE PRECISION,
  "evaluationConfidence" DOUBLE PRECISION,
  "suggestedMarks" DOUBLE PRECISION,
  "maxMarks" DOUBLE PRECISION,
  "feedback" TEXT,
  "rubricNotes" JSONB,
  "needsReview" BOOLEAN NOT NULL DEFAULT false,
  "reviewStatus" "EvaluatedAnswerReviewStatus" NOT NULL DEFAULT 'PENDING',
  "teacherMarks" DOUBLE PRECISION,
  "teacherFeedback" TEXT,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EvaluatedAnswer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiUsageEvent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "units" INTEGER NOT NULL DEFAULT 1,
  "model" TEXT,
  "estimatedCostMinor" INTEGER,
  "meta" JSONB,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AiUsageEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AnswerSheet_tenantId_assignmentId_status_idx" ON "AnswerSheet"("tenantId", "assignmentId", "status");
CREATE INDEX "AnswerSheet_tenantId_studentId_idx" ON "AnswerSheet"("tenantId", "studentId");
CREATE INDEX "AnswerSheet_tenantId_attemptId_idx" ON "AnswerSheet"("tenantId", "attemptId");

CREATE INDEX "EvaluationJob_tenantId_status_createdAt_idx" ON "EvaluationJob"("tenantId", "status", "createdAt");
CREATE INDEX "EvaluationJob_tenantId_answerSheetId_idx" ON "EvaluationJob"("tenantId", "answerSheetId");
CREATE INDEX "EvaluationJob_workerJobId_idx" ON "EvaluationJob"("workerJobId");

CREATE INDEX "EvaluatedAnswer_tenantId_evaluationJobId_idx" ON "EvaluatedAnswer"("tenantId", "evaluationJobId");
CREATE INDEX "EvaluatedAnswer_tenantId_reviewStatus_needsReview_idx" ON "EvaluatedAnswer"("tenantId", "reviewStatus", "needsReview");

CREATE INDEX "AiUsageEvent_tenantId_kind_createdAt_idx" ON "AiUsageEvent"("tenantId", "kind", "createdAt");

ALTER TABLE "AnswerSheet" ADD CONSTRAINT "AnswerSheet_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "AssessmentAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnswerSheet" ADD CONSTRAINT "AnswerSheet_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnswerSheet" ADD CONSTRAINT "AnswerSheet_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "AssessmentAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EvaluationJob" ADD CONSTRAINT "EvaluationJob_answerSheetId_fkey" FOREIGN KEY ("answerSheetId") REFERENCES "AnswerSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EvaluatedAnswer" ADD CONSTRAINT "EvaluatedAnswer_evaluationJobId_fkey" FOREIGN KEY ("evaluationJobId") REFERENCES "EvaluationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
