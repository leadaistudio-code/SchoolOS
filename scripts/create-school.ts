/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { FEATURE } from '../src/lib/features'
import { ROLE } from '../src/lib/rbac/roles'
import { ensureRolesAndPermissions, provisionSchool } from '../src/server/modules/platform/provision'
import { ensureExamDefaults } from '../src/server/modules/exams/defaults'

/**
 * First-run setup for a real deployment.
 *
 * `db:seed` fills a laptop with two fictional schools and hundreds of users
 * who all share one password. That is the wrong starting point for a database
 * that will hold real children's records, but the alternative — creating a
 * tenant, a school, a plan, a subscription, the permission catalogue, eleven
 * system roles and an administrator by hand in a database GUI — is worse.
 *
 * This does exactly that much and nothing else: one school, one administrator,
 * no sample data.
 *
 * Run it with the values on the command line:
 *
 *   npx tsx scripts/create-school.ts \
 *     --slug=stjohns \
 *     --school="St John's High School" \
 *     --email=principal@stjohns.edu.in \
 *     --password='a strong password'
 *
 * It is safe to run twice: everything is upserted, and it refuses to touch an
 * administrator who already exists rather than resetting their password.
 */

const prisma = new PrismaClient()

function arg(name: string): string | undefined {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`))
  return hit?.slice(name.length + 3)
}

function required(name: string): string {
  const value = arg(name)
  if (!value) {
    console.error(`\nMissing --${name}\n`)
    console.error('Example:')
    console.error(
      "  npx tsx scripts/create-school.ts --slug=stjohns --school=\"St John's High School\" \\",
    )
    console.error("    --email=principal@stjohns.edu.in --password='a strong password'\n")
    process.exit(1)
  }
  return value
}

/**
 * The permission catalogue and the system roles.
 *
 * A fresh database has tables and no rows, so an administrator created without
 * this would sign in successfully and then be allowed to do nothing at all.
 */
async function ensureRoles() {
  process.stdout.write('  permissions and roles ... ')
  await ensureRolesAndPermissions(prisma)
  console.log('done')
}

/**
 * A plan with every module switched on.
 *
 * Modules are gated by entitlements, and a tenant with no subscription is
 * entitled to nothing — the sidebar would come up missing Transport, Library
 * and half the product with no explanation. A single-school deployment has no
 * commercial reason to withhold anything from itself.
 */
async function ensurePlan() {
  process.stdout.write('  plan and entitlements ... ')

  const plan = await prisma.plan.upsert({
    where: { code: 'SELF_HOSTED' },
    create: {
      code: 'SELF_HOSTED',
      name: 'Self hosted',
      tier: 'ENTERPRISE',
      description: 'Every module enabled, no limits. For a single-school deployment.',
      priceMinor: 0,
      trialDays: 0,
      sortOrder: 0,
    },
    update: { name: 'Self hosted' },
  })

  const modules = Object.values(FEATURE).filter((key) => key.startsWith('module.'))

  await prisma.planEntitlement.deleteMany({ where: { planId: plan.id } })
  await prisma.planEntitlement.createMany({
    data: modules.map((featureKey) => ({ planId: plan.id, featureKey, enabled: true })),
  })

  console.log(`${modules.length} modules enabled`)
  return plan.id
}

async function main() {
  const slug = required('slug')
  const schoolName = required('school')
  const email = required('email').toLowerCase()
  const password = required('password')
  const rootDomain = arg('domain') ?? process.env.APP_ROOT_DOMAIN ?? null
  // An exact host, for reaching the school somewhere that has no room for a
  // subdomain — a Railway preview URL, or a school on its own domain.
  const exactHost = arg('host')?.replace(/^https?:\/\//, '').split('/')[0]?.toLowerCase()

  if (password.length < 10) {
    console.error('\nThe password must be at least 10 characters.\n')
    process.exit(1)
  }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    console.error('\nThe slug must be lower-case letters, numbers and hyphens only.\n')
    console.error('It becomes the subdomain the school is reached at.\n')
    process.exit(1)
  }

  console.log(`\nSetting up ${schoolName}\n`)

  await ensureRoles()
  const planId = await ensurePlan()

  process.stdout.write('  school ... ')

  const tenant = await prisma.tenant.upsert({
    where: { slug },
    create: { slug, name: schoolName, status: 'ACTIVE' },
    update: { name: schoolName, status: 'ACTIVE' },
  })

  const now = new Date()
  const yearFromNow = new Date(now.getTime() + 365 * 86_400_000)

  await prisma.subscription.upsert({
    where: { tenantId: tenant.id },
    create: {
      tenantId: tenant.id,
      planId,
      status: 'ACTIVE',
      currentStart: now,
      currentEnd: yearFromNow,
    },
    update: { planId, status: 'ACTIVE', currentEnd: yearFromNow },
  })

  await prisma.school.upsert({
    where: { tenantId: tenant.id },
    create: {
      tenantId: tenant.id,
      code: slug.toUpperCase(),
      name: schoolName,
      email,
    },
    update: { name: schoolName },
  })

  // Tenants resolve by exact host first and by subdomain second, so
  // registering the host makes the school reachable at an address that has no
  // subdomain to spare.
  for (const host of [exactHost, rootDomain ? `${slug}.${rootDomain}` : null].filter(
    (value): value is string => !!value,
  )) {
    await prisma.tenantDomain.upsert({
      where: { host },
      create: { tenantId: tenant.id, host, isPrimary: host === exactHost, verified: true },
      update: { verified: true },
    })
  }

  // An academic session has to exist before classes, exams or fees can be
  // created; several screens refuse to load without a current one.
  const yearStart = new Date(now.getFullYear(), 3, 1)
  const sessionName = `${yearStart.getFullYear()}-${String(yearStart.getFullYear() + 1).slice(2)}`

  await prisma.academicSession.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: sessionName } },
    create: {
      tenantId: tenant.id,
      name: sessionName,
      startsOn: yearStart,
      endsOn: new Date(yearStart.getFullYear() + 1, 2, 31),
      isCurrent: true,
    },
    update: { isCurrent: true },
  })

  await ensureExamDefaults(prisma, tenant.id)

  console.log(`${schoolName} (${slug})`)

  process.stdout.write('  administrator ... ')

  const existing = await prisma.user.findFirst({ where: { tenantId: tenant.id, email } })
  if (existing) {
    console.log('already exists, left untouched')
  } else {
    const adminRole = await prisma.role.findFirstOrThrow({
      where: { tenantId: null, key: ROLE.SCHOOL_ADMIN },
    })

    const [firstName, ...rest] = (arg('name') ?? 'School Administrator').split(' ')

    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email,
        firstName: firstName ?? 'School',
        lastName: rest.join(' ') || 'Administrator',
        passwordHash: await bcrypt.hash(password, 12),
        status: 'ACTIVE',
        emailVerifiedAt: now,
        roles: { create: { roleId: adminRole.id } },
      },
    })
    console.log(email)
  }

  console.log('\nDone.\n')
  if (exactHost) {
    console.log(`  Sign in at  https://${exactHost}/login`)
  } else if (rootDomain) {
    console.log(`  Sign in at  https://${slug}.${rootDomain}/login`)
  } else {
    console.log(`  Sign in at  https://<your-domain>/login  (subdomain: ${slug})`)
  }
  console.log(`  Email       ${email}`)
  console.log('  Password    the one you passed in\n')

  await prisma.$disconnect()
}

main().catch(async (error) => {
  console.error('\nSetup failed:', error instanceof Error ? error.message : error, '\n')
  await prisma.$disconnect()
  process.exit(1)
})
