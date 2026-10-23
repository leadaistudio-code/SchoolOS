/* eslint-disable no-console */
import 'dotenv/config'
import { prisma } from '../src/server/db/prisma'
import { runDailyBlog } from '../src/server/modules/blog/generate'

/**
 *   npm run jobs:blog            today's article, if not already written
 *   npm run jobs:blog -- --force another one now
 *
 * Same work as POST /api/cron/blog, for a local run or a backfill.
 */
async function main() {
  const result = await runDailyBlog({ force: process.argv.includes('--force') })
  console.log(JSON.stringify(result, null, 2))
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
