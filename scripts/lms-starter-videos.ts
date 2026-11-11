/* eslint-disable no-console */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { addStarterVideoLessons } from '../prisma/lms-starter-videos'

/**
 * Adds the two starter videos and their quiz to Robotics 101. Safe to re-run.
 *
 *   npx tsx scripts/lms-starter-videos.ts
 */
const prisma = new PrismaClient()

async function main() {
  const host = new URL(process.env.DATABASE_URL ?? 'postgres://unknown').host
  const result = await addStarterVideoLessons(prisma)
  console.log(`${host}: ${result === 'added' ? 'added 2 videos and a quiz' : result === 'present' ? 'already there, nothing changed' : 'Robotics 101 course not found'}`)
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
