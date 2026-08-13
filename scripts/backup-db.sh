#!/usr/bin/env bash
# Dump the application database to backups/.
# Usage: ./scripts/backup-db.sh [label]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -z "${DATABASE_URL:-}" ]]; then
  if [[ -f .env ]]; then
    # shellcheck disable=SC1091
    set -a
    source <(grep -v '^#' .env | grep DATABASE_URL || true)
    set +a
  fi
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is not set" >&2
  exit 1
fi

LABEL="${1:-manual}"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="${ROOT}/backups"
mkdir -p "$OUT_DIR"
OUT="${OUT_DIR}/mycampusview-${LABEL}-${STAMP}.dump"

echo "Writing ${OUT}"
pg_dump --no-owner --format=custom --dbname="$DATABASE_URL" --file="$OUT"
echo "Done. Size: $(du -h "$OUT" | cut -f1)"
echo "$OUT"
