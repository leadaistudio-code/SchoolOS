import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { FEATURE } from '../src/lib/features'

/**
 * Why is the assistant button not showing?
 *
 *   npm run assistant:doctor
 *
 * The launcher is gated three ways, all server-side, and a missing gate means no
 * button rather than a broken one — which is correct behaviour and useless to
 * debug by looking at the screen. This reports every gate for every school and
 * says what to do about the ones that fail.
 *
 * Run it wherever the question is being asked. Inside Railway:
 *
 *   railway ssh --service <web service>
 *   npm run assistant:doctor
 */

function target(): string {
  const url = process.env.DATABASE_URL
  if (!url) return 'no DATABASE_URL set'
  try {
    const { hostname, port, pathname } = new URL(url)
    const local = hostname === 'localhost' || hostname === '127.0.0.1'
    const internal = hostname.endsWith('.railway.internal')
    return `${hostname}:${port || '5432'}${pathname} (${local ? 'local' : internal ? 'inside Railway' : 'REMOTE'})`
  } catch {
    return 'DATABASE_URL is not a valid URL'
  }
}

async function main() {
  console.log(`database: ${target()}\n`)

  const problems: string[] = []
  const prisma = new PrismaClient()

  try {
    /* ---------------------------------------------- 1. the model ---------- */
    const driver = process.env.AI_DRIVER ?? 'none'
    const key = process.env.AI_API_KEY
    const model = process.env.AI_MODEL?.trim()

    console.log('1. Model configuration')
    console.log(`   AI_DRIVER  ${driver}`)
    console.log(`   AI_API_KEY ${key ? `set (${key.length} chars)` : 'NOT SET'}`)
    console.log(`   AI_MODEL   ${model || '(unset — the driver default applies)'}`)

    const configured = (driver === 'anthropic' || driver === 'openai') && Boolean(key)
    if (!configured) {
      problems.push(
        'Set AI_DRIVER (openai or anthropic) and AI_API_KEY on THIS deployment, then redeploy.\n' +
          '     A local .env is not deployed — on Railway they go in the service’s Variables tab.',
      )
    }

    /* ------------------------------------- 2. the permission -------------- */
    const permission = await prisma.permission.findUnique({
      where: { key: 'assistant.use' },
      select: { id: true },
    })

    console.log('\n2. Permission')
    if (!permission) {
      console.log('   assistant.use is NOT in this database')
      problems.push('Run npm run rbac:sync (the deploy does this automatically on Railway).')
    } else {
      const roles = await prisma.role.findMany({
        where: { permissions: { some: { permissionId: permission.id } } },
        select: { key: true, tenantId: true, _count: { select: { users: true } } },
      })
      const holders = roles.reduce((sum, role) => sum + role._count.users, 0)
      console.log(`   assistant.use held by: ${roles.map((r) => r.key).join(', ') || 'no roles'}`)
      console.log(`   users with one of those roles: ${holders}`)
      if (roles.length === 0) {
        problems.push('Run npm run rbac:sync — no role grants the permission yet.')
      }
    }

    /* ------------------------------------------ 3. the plan --------------- */
    console.log('\n3. Module per school')
    const tenants = await prisma.tenant.findMany({
      select: {
        id: true,
        slug: true,
        name: true,
        subscription: {
          select: { plan: { select: { code: true, entitlements: { select: { featureKey: true, enabled: true } } } } },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    if (tenants.length === 0) console.log('   no schools in this database')

    const overrides = await prisma.tenantEntitlementOverride.findMany({
      where: { featureKey: FEATURE.MODULE_AI_ASSIST },
      select: { tenantId: true, enabled: true },
    })

    let anyEnabled = false
    for (const tenant of tenants) {
      const fromPlan =
        tenant.subscription?.plan.entitlements.find((e) => e.featureKey === FEATURE.MODULE_AI_ASSIST)
          ?.enabled ?? false
      const override = overrides.find((o) => o.tenantId === tenant.id)?.enabled
      const enabled = override ?? fromPlan
      if (enabled) anyEnabled = true

      console.log(
        `   ${tenant.slug.padEnd(16)} plan ${(tenant.subscription?.plan.code ?? 'none').padEnd(11)} ` +
          `${enabled ? 'ENABLED' : 'not enabled'}${override !== undefined ? ' (override)' : ''}`,
      )
    }

    if (tenants.length > 0 && !anyEnabled) {
      problems.push(
        `No school has the module. Grant it: npm run assistant:enable -- ${tenants[0]!.slug}`,
      )
    }

    /* ------------------------------------------------ verdict ------------- */
    console.log('')
    if (problems.length === 0) {
      console.log('All three gates pass. Sign out and in again if you were signed in before the')
      console.log('permission was granted — a session carries the rights it was minted with.')
    } else {
      console.log(`${problems.length} thing${problems.length > 1 ? 's' : ''} to fix:\n`)
      problems.forEach((problem, index) => console.log(`  ${index + 1}. ${problem}`))
    }
  } finally {
    await prisma.$disconnect()
  }
}

void main()
