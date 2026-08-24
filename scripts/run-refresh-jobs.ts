/* eslint-disable no-console */
import 'dotenv/config'
import { prisma } from '../src/server/db/prisma'
import { runTeacherRefreshJobs, type RefreshJobKind } from '../src/server/modules/teacher-refresh/jobs'

/**
 * Runs the knowledge-refresh scheduled jobs across every tenant.
 *
 *   npm run jobs:refresh            # runs everything (generate, remind, overdue)
 *   npm run jobs:refresh -- weekly  # just the weekly generation
 *   npm run jobs:refresh -- monthly | reminders | overdue
 *
 * Unlike the HTTP endpoint this needs no CRON_SECRET — it already runs with
 * database credentials. Point a system cron or a CI schedule at it, or call the
 * endpoint; both funnel into the same idempotent, tenant-aware run.
 */
const VALID: RefreshJobKind[] = ['weekly', 'monthly', 'reminders', 'overdue', 'all']

async function main() {
  const arg = (process.argv[2] ?? 'all') as RefreshJobKind
  const kind: RefreshJobKind = VALID.includes(arg) ? arg : 'all'

  const report = await runTeacherRefreshJobs(kind)
  console.log(JSON.stringify(report, null, 2))
  if (report.errors.length > 0) {
    console.error(`Completed with ${report.errors.length} tenant error(s).`)
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
