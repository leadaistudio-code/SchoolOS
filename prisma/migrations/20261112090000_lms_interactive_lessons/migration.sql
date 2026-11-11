-- Robotics 101 upgrade. Additive only: no column is dropped or rewritten.

ALTER TYPE "LmsLessonKind" ADD VALUE IF NOT EXISTS 'INTERACTIVE';

ALTER TABLE "LmsLesson"
  ADD COLUMN "content" JSONB,
  ADD COLUMN "slug" TEXT,
  ADD COLUMN "contentVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "LmsLesson_courseId_slug_key" ON "LmsLesson"("courseId", "slug");

ALTER TABLE "LmsLessonProgress"
  ADD COLUMN "videoSeconds" INTEGER,
  ADD COLUMN "state" JSONB;

ALTER TABLE "LmsProjectSubmission"
  ADD COLUMN "fileKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "code" TEXT,
  ADD COLUMN "pathway" TEXT,
  ADD COLUMN "evidence" JSONB;
