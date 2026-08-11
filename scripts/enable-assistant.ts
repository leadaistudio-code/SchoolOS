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

  if (!slug) {
    console.error('Usage: npx tsx scripts/enable-assistant.ts <school-slug> [--off]')
    process.exit(1)
  }

  const prisma = new PrismaClient()

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
      console.log('  1. AI_DRIVER=anthropic and AI_API_KEY set in .env, then restart the server.')
      console.log('  2. Sign in as a role holding assistant.use — School Admin, Principal or Accountant.')
    }
  } finally {
    await prisma.$disconnect()
  }
}

void main()
