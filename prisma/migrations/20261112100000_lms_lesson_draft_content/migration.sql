-- Draft content for interactive lessons. Additive: learners keep reading "content".
ALTER TABLE "LmsLesson" ADD COLUMN IF NOT EXISTS "draftContent" JSONB;
