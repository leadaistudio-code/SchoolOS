/* eslint-disable no-console */
/**
 * Prints restore-drill instructions. Does not touch any database.
 */
console.log(`Restore drill (scratch DB only)

1. Create an empty scratch database.
2. Set:
     RESTORE_DATABASE_URL=postgresql://…/scratch
     RESTORE_CONFIRM=YES
3. Run:
     bash scripts/restore-db.sh backups/<file>.dump
   or:
     powershell -File scripts/restore-db.ps1 backups\\\\<file>.dump
4. Point a throwaway env at the scratch URL and run:
     npx prisma migrate status
     npm test -- tests/schema-drift.test.ts

Full checklist: docs/BACKUP_RESTORE.md
`)
