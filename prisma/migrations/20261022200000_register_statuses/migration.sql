-- CreateEnum
CREATE TYPE "HomeworkMark" AS ENUM ('COMPLETED', 'PARTIAL', 'NOT_COMPLETED', 'ABSENT', 'NOT_APPLICABLE', 'NO_NOTEBOOK', 'LATE_WORK');

-- CreateEnum
CREATE TYPE "ClassTestStatus" AS ENUM ('COMPLETED', 'ABSENT', 'NOT_APPLICABLE');

-- AlterTable
ALTER TABLE "HomeworkSubmission" ADD COLUMN     "teacherMark" "HomeworkMark";

-- AlterTable
ALTER TABLE "ClassTest" ADD COLUMN     "passingMarks" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "ClassTestResult" ADD COLUMN     "status" "ClassTestStatus";

-- Backfill: rows ticked before statuses existed were completions.
UPDATE "ClassTestResult" SET "status" = 'COMPLETED' WHERE "completed" = true;
UPDATE "HomeworkSubmission" SET "teacherMark" = 'COMPLETED' WHERE "status" = 'REVIEWED' AND "submittedAt" IS NULL AND "reviewedById" IS NOT NULL;
