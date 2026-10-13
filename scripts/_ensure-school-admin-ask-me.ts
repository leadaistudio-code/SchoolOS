/**
 * Ensure School Admin (platform + any tenant clones) has assistant.use
 * so Ask Me can answer for school administrators.
 *
 * Usage: npx tsx scripts/_ensure-school-admin-ask-me.ts
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  const permission = await db.permission.upsert({
    where: { key: 'assistant.use' },
    create: {
      key: 'assistant.use',
      module: 'assistant',
      action: 'use',
      label: 'Ask Me can answer',
    },
    update: {
      label: 'Ask Me can answer',
      module: 'assistant',
      action: 'use',
    },
  })

  const roles = await db.role.findMany({
    where: { key: 'SCHOOL_ADMIN' },
    select: {
      id: true,
      name: true,
      tenantId: true,
      permissions: { where: { permissionId: permission.id }, select: { permissionId: true } },
    },
  })

  let granted = 0
  for (const role of roles) {
    if (role.permissions.length > 0) continue
    await db.rolePermission.create({
      data: { roleId: role.id, permissionId: permission.id },
    })
    granted++
    console.log('granted', role.name, role.tenantId ?? 'platform')
  }

  console.log({
    schoolAdminRoles: roles.length,
    alreadyHad: roles.length - granted,
    newlyGranted: granted,
    permissionLabel: permission.label,
  })
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(async () => {
    await db.$disconnect()
  })
