/* eslint-disable no-console */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { ensureExamDefaultsForAllTenants } from '../src/server/modules/exams/defaults'

/**
 * Ensures every active tenant has exam defaults:
 * grading scale, certificate templates and a report card template.
 *
 *   npm run exam:defaults
 */
const prisma = new PrismaClient()

async function main() {
  const count = await ensureExamDefaultsForAllTenants(prisma)
  console.log(`Exam defaults ensured for ${count} tenant(s).`)
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
