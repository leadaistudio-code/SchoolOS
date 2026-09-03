/* eslint-disable no-console */
import 'dotenv/config'
import { prisma } from '../src/server/db/prisma'
import { runGrowthCrmReminders } from '../src/server/modules/platform/growth/jobs'

/**
 *   npm run jobs:growth
 *
 * Same work as POST /api/cron/growth-crm, for a local or CI cron.
 */
async function main() {
  const report = await runGrowthCrmReminders()
  console.log(JSON.stringify(report, null, 2))
  if (report.errors.length > 0) process.exitCode = 1
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
