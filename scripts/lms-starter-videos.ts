/* eslint-disable no-console */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { createStarterCourse } from '../prisma/lms-starter-course'
import { addStarterVideoLessons } from '../prisma/lms-starter-videos'

/**
 * Makes sure the Robotics 101 catalogue course exists, then adds the two
 * starter videos and their quiz. Safe to re-run.
 *
 *   npx tsx scripts/lms-starter-videos.ts
 */
const prisma = new PrismaClient()

async function main() {
  const host = new URL(process.env.DATABASE_URL ?? 'postgres://unknown').host
  const created = await createStarterCourse(prisma)
  if (created) console.log(`${host}: created the Robotics 101 catalogue course`)
  const result = await addStarterVideoLessons(prisma)
  console.log(`${host}: ${result === 'added' ? 'added 2 videos and a quiz' : result === 'present' ? 'videos already there, nothing changed' : 'Robotics 101 course not found'}`)
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
