-- CreateEnum
CREATE TYPE "MarksSheetStatus" AS ENUM ('OPEN', 'SUBMITTED', 'LOCKED');

-- CreateEnum
CREATE TYPE "MarkEntrySource" AS ENUM ('TEACHER_MANUAL', 'ADMIN_MANUAL', 'CSV_IMPORT');

-- AlterTable
ALTER TABLE "ExamSubject" ADD COLUMN     "marksLockedAt" TIMESTAMP(3),
ADD COLUMN     "marksLockedById" TEXT,
ADD COLUMN     "marksStatus" "MarksSheetStatus" NOT NULL DEFAULT 'OPEN',
ADD COLUMN     "marksSubmittedAt" TIMESTAMP(3),
ADD COLUMN     "marksSubmittedById" TEXT;

-- AlterTable
ALTER TABLE "Mark" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "source" "MarkEntrySource" NOT NULL DEFAULT 'ADMIN_MANUAL';

-- AlterTable
ALTER TABLE "Result" ADD COLUMN     "holistic" JSONB,
ADD COLUMN     "promotionStatus" TEXT;

-- CreateIndex
CREATE INDEX "ExamSubject_tenantId_marksStatus_idx" ON "ExamSubject"("tenantId", "marksStatus");

-- Backfill: existing marks keep their original timestamp.
UPDATE "Mark" SET "createdAt" = "updatedAt";

-- Backfill: a mark entered by the paper's own subject teacher is a teacher entry.
UPDATE "Mark" m
SET "source" = 'TEACHER_MANUAL'
FROM "ExamSubject" es
JOIN "ClassSubject" cs ON cs."id" = es."classSubjectId"
JOIN "Staff" s ON s."id" = cs."teacherId"
WHERE es."id" = m."examSubjectId"
  AND m."enteredById" IS NOT NULL
  AND s."userId" = m."enteredById";

-- Backfill: sheets of exams whose results are already published are locked.
UPDATE "ExamSubject" es
SET "marksStatus" = 'LOCKED', "marksLockedAt" = e."publishedAt"
FROM "Exam" e
WHERE e."id" = es."examId" AND e."status" = 'PUBLISHED';
