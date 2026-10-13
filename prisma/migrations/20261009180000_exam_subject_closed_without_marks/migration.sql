-- Papers an administrator closes without marks are excluded from results.
ALTER TABLE "ExamSubject" ADD COLUMN "closedWithoutMarks" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ExamSubject" ADD COLUMN "closedReason" TEXT;
