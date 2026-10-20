-- Tapasya: persist the full Pomodoro engine state on each session.
-- Additive and nullable; rollback: ALTER TABLE "TapasyaFocusSession" DROP COLUMN "engine";

ALTER TABLE "TapasyaFocusSession" ADD COLUMN "engine" JSONB;
