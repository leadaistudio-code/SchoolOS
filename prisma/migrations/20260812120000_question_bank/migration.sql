-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('MCQ', 'TRUE_FALSE', 'FILL_BLANK', 'MATCH', 'ONE_WORD', 'VERY_SHORT', 'SHORT', 'LONG', 'DESCRIPTIVE', 'CASE_STUDY', 'ASSERTION_REASON', 'NUMERICAL', 'DIAGRAM', 'COMPREHENSION', 'PRACTICAL', 'HOTS');

-- CreateEnum
CREATE TYPE "QuestionDifficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "QuestionOrigin" AS ENUM ('MANUAL', 'AI', 'IMPORTED');

-- CreateEnum
CREATE TYPE "QuestionStatus" AS ENUM ('DRAFT', 'APPROVED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "classSubjectId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL,
    "difficulty" "QuestionDifficulty" NOT NULL DEFAULT 'MEDIUM',
    "marks" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "bloomLevel" "BloomLevel",
    "solution" TEXT,
    "explanation" TEXT,
    "source" TEXT,
    "origin" "QuestionOrigin" NOT NULL DEFAULT 'MANUAL',
    "status" "QuestionStatus" NOT NULL DEFAULT 'APPROVED',
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "fingerprint" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionOption" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "matchWith" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "QuestionOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionTopic" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,

    CONSTRAINT "QuestionTopic_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Question_tenantId_classSubjectId_status_idx" ON "Question"("tenantId", "classSubjectId", "status");

-- CreateIndex
CREATE INDEX "Question_tenantId_fingerprint_idx" ON "Question"("tenantId", "fingerprint");

-- CreateIndex
CREATE INDEX "Question_tenantId_type_difficulty_idx" ON "Question"("tenantId", "type", "difficulty");

-- CreateIndex
CREATE INDEX "Question_tenantId_createdById_idx" ON "Question"("tenantId", "createdById");

-- CreateIndex
CREATE INDEX "QuestionOption_tenantId_questionId_position_idx" ON "QuestionOption"("tenantId", "questionId", "position");

-- CreateIndex
CREATE INDEX "QuestionTopic_tenantId_topicId_idx" ON "QuestionTopic"("tenantId", "topicId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionTopic_tenantId_questionId_topicId_key" ON "QuestionTopic"("tenantId", "questionId", "topicId");

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_classSubjectId_fkey" FOREIGN KEY ("classSubjectId") REFERENCES "ClassSubject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionOption" ADD CONSTRAINT "QuestionOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionTopic" ADD CONSTRAINT "QuestionTopic_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionTopic" ADD CONSTRAINT "QuestionTopic_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

