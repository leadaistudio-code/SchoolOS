-- Archived people must not retain portal access. Keep the User row for the
-- audit trail, but disable the account and revoke every live session.
WITH "ArchivedAccount" AS (
  SELECT "userId" FROM "Student" WHERE "deletedAt" IS NOT NULL AND "userId" IS NOT NULL
  UNION
  SELECT "userId" FROM "Staff" WHERE "deletedAt" IS NOT NULL AND "userId" IS NOT NULL
  UNION
  SELECT "userId" FROM "Parent" WHERE "deletedAt" IS NOT NULL AND "userId" IS NOT NULL
)
UPDATE "Session"
SET "revokedAt" = CURRENT_TIMESTAMP
WHERE "revokedAt" IS NULL
  AND "userId" IN (SELECT "userId" FROM "ArchivedAccount");

WITH "ArchivedAccount" AS (
  SELECT "userId" FROM "Student" WHERE "deletedAt" IS NOT NULL AND "userId" IS NOT NULL
  UNION
  SELECT "userId" FROM "Staff" WHERE "deletedAt" IS NOT NULL AND "userId" IS NOT NULL
  UNION
  SELECT "userId" FROM "Parent" WHERE "deletedAt" IS NOT NULL AND "userId" IS NOT NULL
)
UPDATE "User"
SET "status" = 'DISABLED',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" IN (SELECT "userId" FROM "ArchivedAccount")
  AND "status" <> 'DISABLED';
