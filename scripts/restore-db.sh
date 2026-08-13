#!/usr/bin/env bash
# Restore a custom-format dump into a SCRATCH database only.
# Usage: RESTORE_DATABASE_URL=postgres://... ./scripts/restore-db.sh backups/file.dump
set -euo pipefail

DUMP="${1:-}"
if [[ -z "$DUMP" || ! -f "$DUMP" ]]; then
  echo "Usage: RESTORE_DATABASE_URL=... $0 path/to/backup.dump" >&2
  exit 1
fi

if [[ -z "${RESTORE_DATABASE_URL:-}" ]]; then
  echo "RESTORE_DATABASE_URL must point at an empty scratch database (never production)." >&2
  exit 1
fi

if [[ "${RESTORE_CONFIRM:-}" != "YES" ]]; then
  echo "Refusing to restore without RESTORE_CONFIRM=YES" >&2
  exit 1
fi

echo "Restoring $DUMP into scratch database…"
pg_restore --clean --if-exists --no-owner --dbname="$RESTORE_DATABASE_URL" "$DUMP"
echo "Restore finished. Run prisma migrate status / smoke tests against the scratch DB."
