/* eslint-disable no-console */
/**
 * Ensures a MyCampus Support platform operator exists (tenantId = null).
 *
 * Full school access when entering any school via "Enter as Support".
 * Does not set isSuperAdmin — plans/billing stay with the platform owner.
 *
 *   npx tsx scripts/ensure-mycampus-support.ts --email=support@mycampusview.com --password='...'
 *   npx tsx scripts/ensure-mycampus-support.ts --email=... --password='...' --first=Support --last=Desk
 */
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { ROLE } from '../src/lib/rbac/roles'
import { ensureRolesAndPermissions } from '../src/server/modules/platform/provision'

const prisma = new PrismaClient()

function arg(name: string): string | undefined {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`))
  return hit?.slice(name.length + 3)
}

async function main() {
  const email = (arg('email') ?? '').toLowerCase().trim()
  const password = arg('password')
  if (!email || !email.includes('@')) {
    console.error('Pass --email=support@yourdomain.com')
    process.exit(1)
  }
  if (!password || password.length < 10) {
    console.error('Pass --password= with at least 10 characters')
    process.exit(1)
  }

  await ensureRolesAndPermissions(prisma)

  const supportRole = await prisma.role.findFirst({
    where: { tenantId: null, key: ROLE.MYCAMPUS_SUPPORT },
  })
  if (!supportRole) {
    throw new Error('MYCAMPUS_SUPPORT role missing — run npm run rbac:sync first')
  }

  const passwordHash = await bcrypt.hash(password, 12)
  const existing = await prisma.user.findFirst({ where: { tenantId: null, email } })
  const resetPassword = process.argv.includes('--reset-password') || !existing

  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: {
          ...(resetPassword ? { passwordHash } : {}),
          status: 'ACTIVE',
          tenantId: null,
          // Never demote an existing platform owner.
        },
      })
    : await prisma.user.create({
        data: {
          tenantId: null,
          email,
          firstName: arg('first') ?? 'MyCampus',
          lastName: arg('last') ?? 'Support',
          passwordHash,
          isSuperAdmin: false,
          status: 'ACTIVE',
          emailVerifiedAt: new Date(),
        },
      })

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: supportRole.id } },
    create: { userId: user.id, roleId: supportRole.id },
    update: {},
  })

  console.log(
    `MyCampus Support ready: ${email} (id=${user.id}, isSuperAdmin=${user.isSuperAdmin}, password=${resetPassword ? 'set' : 'unchanged'}). Sign in on the platform host, open a school, click Enter as Support.`,
  )
  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error(err)
  await prisma.$disconnect()
  process.exit(1)
})
