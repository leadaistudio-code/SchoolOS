import { PrismaClient } from '@prisma/client'
import { FEATURE } from '../src/lib/features'

/**
 * Switches the assistant on for one school, without reseeding.
 *
 *   npx tsx scripts/enable-assistant.ts demo
 *
 * The module is included in the ENTERPRISE plan (which enables every `module.*`)
 * and not in STARTER or PRO, so a school on a lower plan needs a per-tenant
 * override. That is the same mechanism used to grant any module outside a plan —
 * a row in `TenantEntitlementOverride`, with a note saying who asked and why.
 *
 * Pass `--off` to withdraw it again.
 */

async function main() {
  const args = process.argv.slice(2)
  const slug = args.find((arg) => !arg.startsWith('-'))
  const enable = !args.includes('--off')

  const prisma = new PrismaClient()

  // A bare usage line is a dead end: the thing you are missing is the slug, and
  // only the database knows it. So list them.
  if (!slug || slug.startsWith('<')) {
    if (slug?.startsWith('<')) {
      console.error(
        'That looks like a placeholder. Pass a real slug — and note PowerShell treats < and > as operators.\n',
      )
    }

    const schools = await prisma.tenant.findMany({
      select: {
        slug: true,
        name: true,
        subscription: { select: { plan: { select: { code: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    })

    if (schools.length === 0) {
      console.error('There are no schools in this database yet. Create one first.')
    } else {
      console.error('Usage: npm run assistant:enable -- <slug>        (--off to withdraw)\n')
      console.error('Schools in this database:')
      for (const school of schools) {
        console.error(
          `  ${school.slug.padEnd(20)} ${school.name} (plan ${
            school.subscription?.plan.code ?? 'none'
          })`,
        )
      }
      console.error(`\ne.g. npm run assistant:enable -- ${schools[0]!.slug}`)
    }

    await prisma.$disconnect()
    process.exit(1)
  }

  try {
    const tenant = await prisma.tenant.findUnique({
      where: { slug },
      select: { id: true, name: true, subscription: { select: { plan: { select: { code: true } } } } },
    })

    if (!tenant) {
      const known = await prisma.tenant.findMany({ select: { slug: true }, take: 20 })
      console.error(
        `No school with slug "${slug}". Known: ${known.map((t) => t.slug).join(', ') || '(none)'}`,
      )
      process.exit(1)
    }

    await prisma.tenantEntitlementOverride.upsert({
      where: { tenantId_featureKey: { tenantId: tenant.id, featureKey: FEATURE.MODULE_AI_ASSIST } },
      create: {
        tenantId: tenant.id,
        featureKey: FEATURE.MODULE_AI_ASSIST,
        enabled: enable,
        note: 'Assistant enabled manually via scripts/enable-assistant.ts',
      },
      update: { enabled: enable },
    })

    console.log(
      `${enable ? 'Enabled' : 'Disabled'} the assistant for ${tenant.name} (plan ${
        tenant.subscription?.plan.code ?? 'none'
      }).`,
    )

    if (enable) {
      console.log('\nStill required before the button appears:')
      console.log('  1. AI_DRIVER (openai or anthropic) and AI_API_KEY set, then restart the server.')
      console.log('  2. Sign in as a role holding assistant.use — School Admin, Principal or Accountant.')
    }
  } finally {
    await prisma.$disconnect()
  }
}

void main()
