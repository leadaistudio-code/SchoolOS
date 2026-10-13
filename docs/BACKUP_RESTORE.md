# Backup and restore drills

Untested backups are rumours. This checklist keeps MyCampusView dumps real.

We use **two layers**:

1. **Railway PITR** — continuous recovery to a chosen time (on Railway)
2. **Nightly dump → Cloudflare R2** — off-platform copy if Railway is down

## Prerequisites

- `pg_dump` / `pg_restore` on your PATH (Postgres client tools)
- `DATABASE_URL` for the source database
- A **scratch** Postgres database for restores (`RESTORE_DATABASE_URL`) — never
  restore into production from this script

`backups/` is gitignored.

---

## Layer 1 — Railway PITR

PITR keeps a base backup plus a continuous change log (WAL) so you can restore
to a specific time (for example “just before the bad delete”).

### Enable (CLI)

```bash
railway postgres pitr enable --service Postgres --environment production
railway postgres pitr status --service Postgres --environment production --json
```

Status should show `"enabled": true` and `"bucketWired": true`.

### Schedule volume backups (dashboard if CLI is unauthorized)

In Railway → project **School OS** → **Postgres** → **Backups**:

1. Confirm **Point-in-time recovery** is on
2. Set schedule to **daily** and **weekly** (or run):

```bash
railway postgres pitr schedule set --daily --weekly --service Postgres --environment production
railway postgres pitr backup create --service Postgres --name pre-migrate --environment production
```

### Restore to a point in time

Creates a **new** Postgres service (does not overwrite production by itself):

```bash
railway postgres pitr restore --service Postgres --environment production \
  --at 2026-09-19T10:00:00Z \
  --new-service-name postgres-restored
```

Point the app at the new URL only after you verify data.

Docs: [Railway Postgres backups & restores](https://docs.railway.com/guides/postgres-backups-restores)

---

## Layer 2 — Nightly dump to Cloudflare R2

Workflow: [`.github/workflows/db-backup-r2.yml`](../.github/workflows/db-backup-r2.yml)

Runs daily at **02:00 IST** (`30 20 * * *` UTC) and on **Actions → Run workflow**.

### One-time Cloudflare setup

1. Cloudflare dashboard → **R2** → create bucket, e.g. `mycampusview-db-backups`
2. **Manage R2 API Tokens** → create token with **Object Read & Write** on that bucket
3. Note:
   - Account ID
   - Access Key ID + Secret Access Key
   - Endpoint: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`

### GitHub secrets (repo → Settings → Secrets and variables → Actions)

| Secret | Value |
| --- | --- |
| `BACKUP_DATABASE_URL` | Railway Postgres **public / TCP proxy** URL (not `*.railway.internal`) |
| `R2_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `R2_BUCKET` | `mycampusview-db-backups` |
| `R2_ACCESS_KEY_ID` | R2 access key |
| `R2_SECRET_ACCESS_KEY` | R2 secret key |

To copy the public DB URL from Railway: Postgres service → **Connect** / **Variables** →
use the URL that works from outside the private network (often `DATABASE_PUBLIC_URL`
or the proxy host on `*.proxy.rlwy.net`).

Dumps land at `s3://<bucket>/database/YYYY/MM/mycampusview-railway-….dump`.
Objects older than **30 days** are pruned by the same workflow.

### Manual dump (local)

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

Before destructive migrations, still take a manual dump:

```bash
railway run pg_dump --no-owner --format=custom > backups/railway-$(date +%F).dump
```

Then upload to R2 if you want an immediate off-platform copy:

```bash
aws s3 cp backups/railway-….dump s3://$R2_BUCKET/database/manual/ \
  --endpoint-url "$R2_ENDPOINT"
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
