/**
 * Set every published Academy catalogue course to freemium unlock ₹499.
 *   railway run --service "MyCampusView WebApp" -- npx tsx scripts/_academy-set-freemium.ts
 *   railway run --service "MyCampusView WebApp" -- npx tsx scripts/_academy-set-freemium.ts --apply
 */
import { PrismaClient } from '@prisma/client'

const PRICE = 49_900
const apply = process.argv.includes('--apply')
const db = new PrismaClient()

async function main() {
  const academy = await db.tenant.findFirst({ where: { slug: 'academy' }, select: { id: true } })
  const courses = await db.lmsCourse.findMany({
    where: {
      deletedAt: null,
      status: 'PUBLISHED',
      OR: [{ tenantId: null }, ...(academy ? [{ tenantId: academy.id }] : [])],
    },
    select: { id: true, title: true, academyPriceMinor: true },
    orderBy: { title: 'asc' },
  })

  console.log(apply ? 'APPLY' : 'DRY RUN')
  for (const c of courses) {
    const before = c.academyPriceMinor == null ? 'null' : `₹${c.academyPriceMinor / 100}`
    console.log(`  ${c.title}: ${before} → ₹${PRICE / 100}`)
  }

  if (!apply) {
    console.log('\nRe-run with --apply to write.')
    return
  }

  const result = await db.lmsCourse.updateMany({
    where: { id: { in: courses.map((c) => c.id) } },
    data: { academyPriceMinor: PRICE },
  })
  console.log(`\nUpdated ${result.count} course(s).`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
