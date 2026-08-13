/* eslint-disable no-console */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { checkPasswordPolicy, hashPassword } from '../src/server/auth/password'
import { tenantUrl } from '../src/server/tenant'

/**
 * Reset a user's password when they forgot it or their account is locked.
 *
 * Intended for platform operators with database access — there is no self-service
 * forgot-password flow yet. Revokes every active session and clears lockout state.
 *
 * Local:
 *   npx tsx scripts/reset-user-password.ts \
 *     --email=admin@littlepathshala.com \
 *     --password='TemporaryPass123'
 *
 * Production (uses the Railway Postgres inside the container):
 *   railway ssh --service SchoolOS -- npx tsx scripts/reset-user-password.ts \  # SchoolOS = Railway app service name
 *     --email=admin@littlepathshala.com \
 *     --password='TemporaryPass123'
 *
 * If the email exists in more than one school, pass --slug=little-pathshala.
 */

const prisma = new PrismaClient()

function arg(name: string): string | undefined {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`))
  return hit?.slice(name.length + 3)
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

function describeTarget(): string {
  const url = process.env.DATABASE_URL
  if (!url) return 'no DATABASE_URL set'
  try {
    const { hostname, port, pathname } = new URL(url)
    const local = hostname === 'localhost' || hostname === '127.0.0.1'
    const internal = hostname.endsWith('.railway.internal')
    const where = local ? 'local' : internal ? 'inside Railway' : 'REMOTE'
    return `${hostname}:${port || '5432'}${pathname} (${where})`
  } catch {
    return 'DATABASE_URL is not a valid URL'
  }
}

function required(name: string): string {
  const value = arg(name)
  if (!value) {
    console.error(`\nMissing --${name}\n`)
    console.error('Example:')
    console.error(
      "  npx tsx scripts/reset-user-password.ts --email=admin@school.edu --password='TemporaryPass123'\n",
    )
    process.exit(1)
  }
  return value
}

async function main() {
  const email = required('email').trim().toLowerCase()
  const password = required('password')
  const slug = arg('slug')?.trim().toLowerCase()
  const skipMustChange = hasFlag('no-must-change')

  const policyIssues = checkPasswordPolicy(password)
  if (policyIssues.length > 0) {
    console.error('\nPassword does not meet policy:\n')
    for (const issue of policyIssues) console.error(`  • ${issue}`)
    console.error('')
    process.exit(1)
  }

  console.log(`database: ${describeTarget()}`)

  let tenantIdFilter: string | undefined
  if (slug) {
    const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } })
    if (!tenant) {
      console.error(`\nNo tenant with slug "${slug}".\n`)
      process.exit(1)
    }
    tenantIdFilter = tenant.id
  }

  const users = await prisma.user.findMany({
    where: {
      email,
      deletedAt: null,
      ...(tenantIdFilter ? { tenantId: tenantIdFilter } : {}),
    },
    orderBy: { createdAt: 'asc' },
  })

  if (users.length === 0) {
    console.error(`\nNo user found with email ${email}${slug ? ` in tenant ${slug}` : ''}.\n`)
    process.exit(1)
  }

  if (users.length > 1 && !slug) {
    const tenantIds = [...new Set(users.map((u) => u.tenantId).filter(Boolean))] as string[]
    const tenants = tenantIds.length
      ? await prisma.tenant.findMany({
          where: { id: { in: tenantIds } },
          select: { id: true, slug: true, name: true },
        })
      : []
    const tenantById = new Map(tenants.map((t) => [t.id, t]))

    console.error(`\nEmail ${email} matches ${users.length} accounts. Pass --slug= to pick one:\n`)
    for (const user of users) {
      const tenant = user.tenantId ? tenantById.get(user.tenantId) : null
      console.error(`  • ${tenant?.slug ?? '(platform)'} — ${tenant?.name ?? 'Platform operator'}`)
    }
    console.error('')
    process.exit(1)
  }

  const user = users[0]!
  const tenant = user.tenantId
    ? await prisma.tenant.findUnique({
        where: { id: user.tenantId },
        select: {
          slug: true,
          name: true,
          domains: { where: { isPrimary: true }, take: 1 },
        },
      })
    : null
  const passwordHash = await hashPassword(password)

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordChangedAt: new Date(),
        mustChangePassword: skipMustChange ? false : true,
        failedLoginCount: 0,
        lockedUntil: null,
        status: 'ACTIVE',
      },
    }),
    prisma.session.deleteMany({ where: { userId: user.id } }),
  ])

  const loginUrl = tenant
    ? tenant.domains[0]?.host
      ? `https://${tenant.domains[0].host}/login`
      : tenantUrl(tenant.slug, '/login')
    : null

  console.log('\nPassword reset.\n')
  console.log(`  User        ${user.firstName} ${user.lastName}`.trim())
  console.log(`  Email       ${email}`)
  if (tenant) {
    console.log(`  School      ${tenant.name} (${tenant.slug})`)
  } else {
    console.log('  Account     Platform operator')
  }
  if (loginUrl) console.log(`  Sign in at  ${loginUrl}`)
  console.log(
    skipMustChange
      ? '  Note        User can sign in with the password above.'
      : '  Note        User must set a new password on first sign-in.',
  )
  console.log('')
}

main()
  .catch(async (err) => {
    console.error('\nReset failed:', err instanceof Error ? err.message : err, '\n')
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
