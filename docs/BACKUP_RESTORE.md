# Backup and restore drills

Untested backups are rumours. This checklist keeps MyCampusView dumps real.

## Prerequisites

- `pg_dump` / `pg_restore` on your PATH (Postgres client tools)
- `DATABASE_URL` for the source database
- A **scratch** Postgres database for restores (`RESTORE_DATABASE_URL`) — never
  restore into production from this script

`backups/` is gitignored.

## Take a backup

```bash
# macOS / Linux
chmod +x scripts/backup-db.sh scripts/restore-db.sh
./scripts/backup-db.sh pre-migrate

# Windows
powershell -File scripts/backup-db.ps1 -Label pre-migrate

# npm
npm run db:backup
```

Custom format dumps land in `backups/mycampusview-<label>-<timestamp>.dump`.

On Railway, prefer scheduled backups in the Postgres service settings, and still
take a manual dump before destructive migrations:

```bash
railway run pg_dump --no-owner --format=custom > backups/railway-$(date +%F).dump
```

## Restore drill (scratch only)

1. Create an empty scratch database (local Docker or a throwaway Railway/Neon DB).
2. Restore:

```bash
RESTORE_DATABASE_URL='postgresql://…/mycampusview_scratch' \
RESTORE_CONFIRM=YES \
  ./scripts/restore-db.sh backups/mycampusview-pre-migrate-….dump
```

Windows:

```powershell
$env:RESTORE_DATABASE_URL = "postgresql://…/mycampusview_scratch"
$env:RESTORE_CONFIRM = "YES"
powershell -File scripts/restore-db.ps1 backups\mycampusview-….dump
```

3. Point a throwaway `.env` at the scratch URL and run:

```bash
npx prisma migrate status
npm test -- tests/schema-drift.test.ts
```

4. Record the date of the successful drill in your ops log.

## Suggested cadence

| When | Action |
| --- | --- |
| Before every destructive migration | Manual `db:backup` |
| Weekly | Confirm managed provider backups are green |
| Quarterly | Full restore drill into scratch + smoke tests |

## npm scripts

| Script | What it does |
| --- | --- |
| `npm run db:backup` | `pg_dump` custom format into `backups/` |
| `npm run db:restore-drill` | Prints restore instructions (does not touch prod) |
