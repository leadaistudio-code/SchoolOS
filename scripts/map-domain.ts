/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client'

/**
 * Points a web address at a school.
 *
 * A school is found from the host name of the request: first by an exact
 * match in `TenantDomain`, then by reading a subdomain of `APP_ROOT_DOMAIN`.
 * Seeded data registers `<slug>.lvh.me`, which is right for a laptop and
 * meaningless anywhere else — so on a hosted deployment nothing resolves and
 * the login page has no school to show.
 *
 * This registers the exact address a deployment is actually reachable at:
 *
 *   npx tsx scripts/map-domain.ts --slug=demo --host=myapp.up.railway.app
 *
 * Safe to run repeatedly, and to run for several hosts pointing at one school.
 */

const prisma = new PrismaClient()

function arg(name: string): string | undefined {
  return process.argv.find((v) => v.startsWith(`--${name}=`))?.slice(name.length + 3)
}

async function main() {
  const slug = arg('slug')
  const host = arg('host')
    ?.replace(/^https?:\/\//, '')
    .split('/')[0]
    ?.toLowerCase()

  if (!slug || !host) {
    console.error('\nUsage:')
    console.error('  npx tsx scripts/map-domain.ts --slug=demo --host=myapp.up.railway.app\n')
    process.exit(1)
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true, name: true },
  })

  if (!tenant) {
    const available = await prisma.tenant.findMany({ select: { slug: true } })
    console.error(`\nNo school with the slug "${slug}".`)
    console.error(
      available.length
        ? `Available: ${available.map((t) => t.slug).join(', ')}\n`
        : 'There are no schools in this database yet.\n',
    )
    process.exit(1)
  }

  // Any other school holding this host would silently lose its traffic, so the
  // clash is reported rather than reassigned.
  const clash = await prisma.tenantDomain.findUnique({
    where: { host },
    select: { tenantId: true },
  })
  if (clash && clash.tenantId !== tenant.id) {
    const owner = await prisma.tenant.findUnique({
      where: { id: clash.tenantId },
      select: { slug: true },
    })
    console.error(`\n${host} is already pointed at "${owner?.slug}".`)
    console.error('Remove that mapping first if you meant to move it.\n')
    process.exit(1)
  }

  await prisma.tenantDomain.upsert({
    where: { host },
    create: { tenantId: tenant.id, host, isPrimary: true, verified: true },
    update: { tenantId: tenant.id, verified: true },
  })

  console.log(`\n${host} now opens ${tenant.name}.\n`)
  console.log(`  https://${host}/login\n`)

  await prisma.$disconnect()
}

main().catch(async (error) => {
  console.error('\nFailed:', error instanceof Error ? error.message : error, '\n')
  await prisma.$disconnect()
  process.exit(1)
})
