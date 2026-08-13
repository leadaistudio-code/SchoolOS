/* eslint-disable no-console */
/**
 * Ensures a platform operator account exists (tenantId = null).
 *
 *   npx tsx scripts/ensure-platform-owner.ts --email=you@example.com --password='...'
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
  const email = (arg('email') ?? 'owner@schoolos.dev').toLowerCase()
  const password = arg('password')
  if (!password || password.length < 10) {
    console.error('Pass --password= with at least 10 characters')
    process.exit(1)
  }

  await ensureRolesAndPermissions(prisma)

  const superAdminRole = await prisma.role.findFirst({
    where: { tenantId: null, key: ROLE.SUPER_ADMIN },
  })
  if (!superAdminRole) throw new Error('SUPER_ADMIN role missing — run db:seed or rbac:sync')

  const passwordHash = await bcrypt.hash(password, 12)
  const existing = await prisma.user.findFirst({ where: { tenantId: null, email } })
  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: {
          passwordHash,
          isSuperAdmin: true,
          status: 'ACTIVE',
          tenantId: null,
        },
      })
    : await prisma.user.create({
        data: {
          tenantId: null,
          email,
          firstName: arg('first') ?? 'Platform',
          lastName: arg('last') ?? 'Owner',
          passwordHash,
          isSuperAdmin: true,
          status: 'ACTIVE',
          emailVerifiedAt: new Date(),
        },
      })

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: superAdminRole.id } },
    create: { userId: user.id, roleId: superAdminRole.id },
    update: {},
  })

  console.log(`Platform owner ready: ${email} (tenantId=null, isSuperAdmin=true)`)
  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error(err)
  await prisma.$disconnect()
  process.exit(1)
})
