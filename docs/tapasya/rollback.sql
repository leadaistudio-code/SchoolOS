-- Reverses prisma/migrations/20261019120000_tapasya and
-- 20261019130000_tapasya_engine_state (whose only change, a column on
-- "TapasyaFocusSession", goes with that table). Prisma has no down
-- migrations, so this is run by hand, and then both migration rows are removed:
--
--   psql "$DATABASE_URL" -f docs/tapasya/rollback.sql
--   DELETE FROM "_prisma_migrations" WHERE migration_name IN ('20261019120000_tapasya', '20261019130000_tapasya_engine_state');
--
-- It drops every Tapasya row, including the XP ledger. Take a backup first
-- (npm run db:backup). No existing table is touched.

BEGIN;

DROP TABLE IF EXISTS "GlobalLeaderboardSnapshot";
DROP TABLE IF EXISTS "GlobalLeaderboardEntry";
DROP TABLE IF EXISTS "GlobalLeaderboardProfile";
DROP TABLE IF EXISTS "GlobalLeaderboardSeason";
DROP TABLE IF EXISTS "GlobalScoringConfig";
DROP TABLE IF EXISTS "GlobalTapasyaSetting";
DROP TABLE IF EXISTS "TapasyaUserAchievement";
DROP TABLE IF EXISTS "TapasyaXpEvent";
DROP TABLE IF EXISTS "TapasyaUnlockRequest";
DROP TABLE IF EXISTS "TapasyaDevice";
DROP TABLE IF EXISTS "TapasyaSessionEvent";
DROP TABLE IF EXISTS "TapasyaFocusInterval";
DROP TABLE IF EXISTS "TapasyaFocusSession";
DROP TABLE IF EXISTS "TapasyaTask";
DROP TABLE IF EXISTS "TapasyaPreset";
DROP TABLE IF EXISTS "TapasyaSchoolPolicy";

DROP TYPE IF EXISTS "GlobalLeaderboardPeriod";
DROP TYPE IF EXISTS "GlobalProfileStatus";
DROP TYPE IF EXISTS "TapasyaUnlockStatus";
DROP TYPE IF EXISTS "TapasyaXpStatus";
DROP TYPE IF EXISTS "TapasyaRestrictionLevel";
DROP TYPE IF EXISTS "TapasyaSessionState";
DROP TYPE IF EXISTS "TapasyaTaskCategory";
DROP TYPE IF EXISTS "TapasyaTaskStatus";

COMMIT;
