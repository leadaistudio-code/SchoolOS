import { z } from 'zod'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { ApiException, conflict, notFound } from '@/server/api/response'
import { PERMISSIONS } from '@/lib/rbac/permissions'
import { ROLE } from '@/lib/rbac/roles'
import { currentPortalUserWhere } from '@/server/modules/settings/users'

export const roleSchema = z.object({
  name: z.string().trim().min(2, 'Name the role').max(60),
  description: z.string().trim().max(200).optional(),
  copyFromRoleId: z.string().optional(),
})

export const rolePermissionsSchema = z.object({
  id: z.string().min(1),
  permissionKeys: z.array(z.string().min(1)).max(400).default([]),
})

/** Platform operators — never shown or edited from a school settings screen. */
const PLATFORM_ONLY_ROLE_KEYS = new Set<string>([ROLE.SUPER_ADMIN, ROLE.MYCAMPUS_SUPPORT])

/**
 * Roles, built-in and custom.
 *
 * Built-in roles start as shared platform rows (`tenantId: null`). A school
 * admin can edit their permissions: the first save clones that role into this
 * tenant (same key), remounts this school's people onto the clone, and then
 * edits only the clone. Other schools keep the platform defaults.
 */
export async function listRoles(ctx: AppContext) {
  ctx.require('roles.view')

  const roles = await ctx.db.role.findMany({
    where: { OR: [{ tenantId: ctx.tenant.id }, { tenantId: null }] },
    orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    select: {
      id: true,
      key: true,
      name: true,
      description: true,
      isSystem: true,
      tenantId: true,
      permissions: { select: { permission: { select: { key: true, module: true } } } },
      // Built-in roles are shared platform records, so an unfiltered relation
      // count would include people from every school. Match the Users page by
      // counting only non-deleted accounts in the current tenant.
      _count: {
        select: {
          users: {
            where: {
              user: {
                tenantId: ctx.tenant.id,
                deletedAt: null,
                ...currentPortalUserWhere,
              },
            },
          },
        },
      },
    },
  })

  // Prefer this school's clone of a built-in key over the shared platform row.
  const byKey = new Map<string, (typeof roles)[number]>()
  for (const role of roles) {
    if (PLATFORM_ONLY_ROLE_KEYS.has(role.key)) continue
    const existing = byKey.get(role.key)
    if (!existing) {
      byKey.set(role.key, role)
      continue
    }
    if (role.tenantId === ctx.tenant.id && existing.tenantId === null) {
      byKey.set(role.key, role)
    }
  }

  return [...byKey.values()].sort((a, b) => {
    if (a.isSystem !== b.isSystem) return a.isSystem ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

/** The permission catalogue, grouped the way the editor renders it. */
export function permissionCatalogue() {
  const moduleLabels: Record<string, string> = {
    assistant: 'Ask Me',
    fees: 'Fees',
    students: 'Students',
    academics: 'Academics',
    attendance: 'Attendance',
    exams: 'Exams',
    settings: 'Settings',
    users: 'Users',
    roles: 'Roles',
  }
  const byModule = new Map<string, { key: string; label: string }[]>()
  for (const permission of PERMISSIONS) {
    if (permission.module === 'platform') continue
    byModule.set(permission.module, [
      ...(byModule.get(permission.module) ?? []),
      { key: permission.key, label: permission.label },
    ])
  }
  return [...byModule.entries()]
    .map(([module, permissions]) => ({
      module: moduleLabels[module] ?? module,
      moduleKey: module,
      permissions,
    }))
    .sort((a, b) => a.module.localeCompare(b.module))
}

export async function createRole(ctx: AppContext, input: z.infer<typeof roleSchema>) {
  ctx.require('roles.manage')

  const key = input.name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 40)
  const existing = await ctx.db.role.findFirst({ where: { tenantId: ctx.tenant.id, key } })
  if (existing) throw conflict(`A role called ${input.name} already exists`)

  const source = input.copyFromRoleId
    ? await ctx.db.role.findFirst({
        where: {
          id: input.copyFromRoleId,
          OR: [{ tenantId: ctx.tenant.id }, { tenantId: null }],
        },
        select: { key: true, permissions: { select: { permissionId: true } } },
      })
    : null
  if (input.copyFromRoleId && !source) throw notFound('Role')
  if (source && PLATFORM_ONLY_ROLE_KEYS.has(source.key)) {
    throw new ApiException(403, 'FORBIDDEN', 'That role cannot be copied')
  }

  const created = await ctx.db.role.create({
    data: {
      tenantId: ctx.tenant.id,
      key,
      name: input.name.trim(),
      description: input.description,
      isSystem: false,
      ...(source
        ? {
            permissions: {
              createMany: {
                data: source.permissions.map((p) => ({ permissionId: p.permissionId })),
              },
            },
          }
        : {}),
    },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'role.create',
    module: 'settings',
    entityType: 'Role',
    entityId: created.id,
    summary: `Created role ${created.name}`,
    after: created,
  })
  return created
}

/**
 * Saves a role's permission set for this school.
 *
 * - Custom school roles: updated in place.
 * - Shared built-in roles: cloned into this tenant on first save, then people
 *   who held the shared role here are remounted onto the clone.
 * Platform.* keys are stripped. SUPER_ADMIN / MYCAMPUS_SUPPORT stay immutable.
 */
export async function setRolePermissions(
  ctx: AppContext,
  input: z.infer<typeof rolePermissionsSchema>,
) {
  ctx.require('roles.manage')

  const wanted = input.permissionKeys.filter((key) => !key.startsWith('platform.'))
  const permissions = await ctx.db.permission.findMany({
    where: { key: { in: wanted } },
    select: { id: true },
  })

  const tenantRole = await ctx.db.role.findFirst({
    where: { id: input.id, tenantId: ctx.tenant.id },
    select: { id: true, name: true, key: true, isSystem: true },
  })

  if (tenantRole) {
    await ctx.db.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: tenantRole.id } })
      if (permissions.length > 0) {
        await tx.rolePermission.createMany({
          data: permissions.map((p) => ({ roleId: tenantRole.id, permissionId: p.id })),
        })
      }
    })
    await audit({
      tenantId: ctx.tenant.id,
      actorId: ctx.user.userId,
      actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
      action: 'role.permissions',
      module: 'settings',
      entityType: 'Role',
      entityId: tenantRole.id,
      summary: `${tenantRole.name} now has ${permissions.length} permissions`,
      after: { permissionKeys: wanted },
    })
    return { id: tenantRole.id }
  }

  const platformRole = await ctx.db.role.findFirst({
    where: { id: input.id, tenantId: null, isSystem: true },
    select: {
      id: true,
      key: true,
      name: true,
      description: true,
    },
  })
  if (!platformRole) throw notFound('Role')
  if (PLATFORM_ONLY_ROLE_KEYS.has(platformRole.key)) {
    throw new ApiException(403, 'FORBIDDEN', 'Platform roles cannot be edited by a school')
  }

  const clone = await materializeBuiltInRoleForTenant(ctx, platformRole, permissions.map((p) => p.id))

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'role.customize',
    module: 'settings',
    entityType: 'Role',
    entityId: clone.id,
    summary: `Customized built-in role ${clone.name} for this school (${permissions.length} permissions)`,
    after: { permissionKeys: wanted, clonedFrom: platformRole.id },
  })
  return { id: clone.id }
}

/**
 * Creates (or reuses) this school's copy of a built-in role and remounts local
 * users from the shared platform role onto it.
 */
async function materializeBuiltInRoleForTenant(
  ctx: AppContext,
  platformRole: { id: string; key: string; name: string; description: string | null },
  permissionIds: string[],
) {
  const existing = await ctx.db.role.findFirst({
    where: { tenantId: ctx.tenant.id, key: platformRole.key },
    select: { id: true, name: true },
  })

  return ctx.db.$transaction(async (tx) => {
    const clone =
      existing ??
      (await tx.role.create({
        data: {
          tenantId: ctx.tenant.id,
          key: platformRole.key,
          name: platformRole.name,
          description: platformRole.description,
          // Still "built-in" for this school — appears in the built-in list,
          // cannot be deleted like a throwaway custom role.
          isSystem: true,
        },
      }))

    await tx.rolePermission.deleteMany({ where: { roleId: clone.id } })
    if (permissionIds.length > 0) {
      await tx.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({ roleId: clone.id, permissionId })),
        skipDuplicates: true,
      })
    }

    // Remount this school's people from the shared role onto the school copy.
    const holders = await tx.userRole.findMany({
      where: {
        roleId: platformRole.id,
        user: { tenantId: ctx.tenant.id, deletedAt: null },
      },
      select: { userId: true },
    })
    if (holders.length > 0) {
      await tx.userRole.createMany({
        data: holders.map((h) => ({ userId: h.userId, roleId: clone.id })),
        skipDuplicates: true,
      })
      await tx.userRole.deleteMany({
        where: {
          roleId: platformRole.id,
          userId: { in: holders.map((h) => h.userId) },
        },
      })
    }

    return { id: clone.id, name: clone.name }
  })
}

/** Deletes a custom role. Refuses built-ins and roles that still have members. */
export async function deleteRole(ctx: AppContext, id: string) {
  ctx.require('roles.manage')

  const role = await ctx.db.role.findFirst({
    where: { id, tenantId: ctx.tenant.id },
    select: {
      id: true,
      name: true,
      key: true,
      isSystem: true,
      _count: {
        select: {
          users: {
            where: {
              user: {
                tenantId: ctx.tenant.id,
                deletedAt: null,
              },
            },
          },
        },
      },
    },
  })
  if (!role) throw notFound('Role')
  if (role.isSystem) {
    throw new ApiException(
      409,
      'CONFLICT',
      'Built-in roles cannot be deleted. Reset them to platform defaults instead.',
    )
  }
  if (role._count.users > 0) {
    throw conflict(`Move the ${role._count.users} people holding this role to another one first`)
  }

  await ctx.db.role.delete({ where: { id } })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'role.delete',
    module: 'settings',
    entityType: 'Role',
    entityId: id,
    summary: `Deleted role ${role.name}`,
    before: role,
  })
}

/**
 * Drops this school's customized built-in role and remounts people back onto
 * the shared platform role (restoring platform defaults for this school only).
 */
export async function resetBuiltInRole(ctx: AppContext, id: string) {
  ctx.require('roles.manage')

  const role = await ctx.db.role.findFirst({
    where: { id, tenantId: ctx.tenant.id, isSystem: true },
    select: { id: true, key: true, name: true },
  })
  if (!role) throw notFound('Customized role')
  if (PLATFORM_ONLY_ROLE_KEYS.has(role.key)) {
    throw new ApiException(403, 'FORBIDDEN', 'Platform roles cannot be reset here')
  }

  const platformRole = await ctx.db.role.findFirst({
    where: { tenantId: null, key: role.key, isSystem: true },
    select: { id: true },
  })
  if (!platformRole) throw notFound('Platform role')

  await ctx.db.$transaction(async (tx) => {
    const holders = await tx.userRole.findMany({
      where: { roleId: role.id },
      select: { userId: true },
    })
    if (holders.length > 0) {
      await tx.userRole.createMany({
        data: holders.map((h) => ({ userId: h.userId, roleId: platformRole.id })),
        skipDuplicates: true,
      })
      await tx.userRole.deleteMany({ where: { roleId: role.id } })
    }
    await tx.role.delete({ where: { id: role.id } })
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'role.reset',
    module: 'settings',
    entityType: 'Role',
    entityId: id,
    summary: `Reset ${role.name} to platform defaults`,
  })
}
