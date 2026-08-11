import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PERMISSIONS } from '../src/lib/rbac/permissions'
import { SYSTEM_ROLES } from '../src/lib/rbac/roles'

/**
 * Pushes the permission catalogue and the built-in role grants into the database.
 *
 *   npm run rbac:sync
 *
 * Why this exists: permissions are defined in code but *stored* per role, and a
 * session's rights are read from those rows. Adding a permission key to
 * `lib/rbac/permissions.ts` therefore does nothing on its own — until this runs,
 * every existing role is missing it, and the feature it gates is invisible to
 * everybody including the school admin. That is a confusing failure (the code is
 * right, the UI is empty), so it gets its own command rather than living only
 * inside `db:seed`, which also rewrites demo data and takes minutes.
 *
 * Custom roles a school created itself are left alone. Only `isSystem` roles are
 * re-granted, because those are the ones this repository defines.
 */

async function main() {
  const prisma = new PrismaClient()
  const dryRun = process.argv.includes('--dry-run')

  try {
    const before = await prisma.permission.count()

    if (!dryRun) {
      await prisma.$transaction(
        PERMISSIONS.map((permission) =>
          prisma.permission.upsert({
            where: { key: permission.key },
            create: permission,
            update: {
              module: permission.module,
              action: permission.action,
              label: permission.label,
            },
          }),
        ),
      )
    }

    const permissionIds = new Map(
      (await prisma.permission.findMany({ select: { id: true, key: true } })).map((p) => [
        p.key,
        p.id,
      ]),
    )

    const missing = PERMISSIONS.filter((p) => !permissionIds.has(p.key)).map((p) => p.key)
    if (missing.length && !dryRun) {
      throw new Error(`Permissions failed to upsert: ${missing.join(', ')}`)
    }

    // On a dry run the upsert above did not happen, so a brand-new permission is
    // absent from `permissionIds` and would filter itself out of every diff —
    // reporting "unchanged" for exactly the change you ran this to preview. Treat
    // code keys as present for the purpose of the preview.
    const willExist = new Set([...permissionIds.keys(), ...PERMISSIONS.map((p) => p.key)])
    if (dryRun && missing.length) {
      console.log(`  new permissions this would create: ${missing.join(', ')}`)
    }

    console.log(
      `permissions: ${PERMISSIONS.length} in code, ${before} in the database before this run`,
    )

    for (const def of SYSTEM_ROLES) {
      // A compound unique containing a nullable column cannot be matched with
      // null in Prisma, so system roles are resolved by findFirst.
      const role = await prisma.role.findFirst({ where: { tenantId: null, key: def.key } })
      if (!role) {
        console.log(`  ${def.key}: not in the database — run npm run db:seed first`)
        continue
      }

      const current = await prisma.rolePermission.findMany({
        where: { roleId: role.id },
        select: { permission: { select: { key: true } } },
      })
      const held = new Set(current.map((row) => row.permission.key))
      const wanted = def.permissions.filter((key) => willExist.has(key))
      const added = wanted.filter((key) => !held.has(key))
      const removed = [...held].filter((key) => !def.permissions.includes(key))

      if (added.length === 0 && removed.length === 0) {
        console.log(`  ${def.key}: unchanged (${held.size})`)
        continue
      }

      if (!dryRun) {
        await prisma.rolePermission.deleteMany({ where: { roleId: role.id } })
        await prisma.rolePermission.createMany({
          data: wanted
            .map((key) => permissionIds.get(key))
            .filter((id): id is string => Boolean(id))
            .map((permissionId) => ({ roleId: role.id, permissionId })),
          skipDuplicates: true,
        })
      }

      console.log(
        `  ${def.key}: ${dryRun ? 'would add' : 'added'} ${added.length}${
          added.length ? ` (${added.slice(0, 6).join(', ')}${added.length > 6 ? '…' : ''})` : ''
        }${removed.length ? `, removed ${removed.length}` : ''}`,
      )
    }

    if (dryRun) console.log('\nDry run — nothing was written.')
    else console.log('\nDone. Users must sign out and in again for new rights to reach a session.')
  } finally {
    await prisma.$disconnect()
  }
}

void main()
