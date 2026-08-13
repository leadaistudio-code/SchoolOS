import { z } from 'zod'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { ApiException, conflict, notFound } from '@/server/api/response'
import { PERMISSIONS } from '@/lib/rbac/permissions'

export const roleSchema = z.object({
  name: z.string().trim().min(2, 'Name the role').max(60),
  description: z.string().trim().max(200).optional(),
  copyFromRoleId: z.string().optional(),
})

export const rolePermissionsSchema = z.object({
  id: z.string().min(1),
  permissionKeys: z.array(z.string().min(1)).max(400).default([]),
})

/**
 * Roles, built-in and custom.
 *
 * System roles are shared across every tenant and are read-only here: editing
 * one would change what "Teacher" means for every school on the platform. A
 * school that needs a different shape copies one into a role of its own,
 * which is why creation offers a starting point rather than a blank slate.
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
      _count: { select: { users: true } },
    },
  })

  // The platform super-admin role is not a school role and granting it from a
  // tenant screen would be a privilege-escalation bug waiting to happen.
  return roles.filter((role) => role.key !== 'SUPER_ADMIN')
}

/** The permission catalogue, grouped the way the editor renders it. */
export function permissionCatalogue() {
  const byModule = new Map<string, { key: string; label: string }[]>()
  for (const permission of PERMISSIONS) {
    if (permission.module === 'platform') continue
    byModule.set(permission.module, [
      ...(byModule.get(permission.module) ?? []),
      { key: permission.key, label: permission.label },
    ])
  }
  return [...byModule.entries()]
    .map(([module, permissions]) => ({ module, permissions }))
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
  if (source?.key === 'SUPER_ADMIN') {
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
 * Replaces a custom role's permission set.
 *
 * Platform permissions are stripped rather than rejected: they are not
 * offered by the editor, so their presence means a crafted request, and
 * silently dropping them keeps the rest of the save working while granting
 * nothing it should not.
 */
export async function setRolePermissions(
  ctx: AppContext,
  input: z.infer<typeof rolePermissionsSchema>,
) {
  ctx.require('roles.manage')

  const role = await ctx.db.role.findFirst({
    where: { id: input.id, tenantId: ctx.tenant.id },
    select: { id: true, name: true, isSystem: true },
  })
  if (!role) throw notFound('Role')
  if (role.isSystem) {
    throw new ApiException(409, 'CONFLICT', 'Built-in roles cannot be edited. Copy it into a custom role instead.')
  }

  const wanted = input.permissionKeys.filter((key) => !key.startsWith('platform.'))
  const permissions = await ctx.db.permission.findMany({
    where: { key: { in: wanted } },
    select: { id: true },
  })

  await ctx.db.$transaction(async (tx) => {
    await tx.rolePermission.deleteMany({ where: { roleId: role.id } })
    if (permissions.length > 0) {
      await tx.rolePermission.createMany({
        data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
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
    entityId: role.id,
    summary: `${role.name} now has ${permissions.length} permissions`,
    after: { permissionKeys: wanted },
  })
}

/** Deletes a custom role. Refuses while anybody still holds it. */
export async function deleteRole(ctx: AppContext, id: string) {
  ctx.require('roles.manage')

  const role = await ctx.db.role.findFirst({
    where: { id, tenantId: ctx.tenant.id },
    select: { id: true, name: true, isSystem: true, _count: { select: { users: true } } },
  })
  if (!role) throw notFound('Role')
  if (role.isSystem) throw new ApiException(409, 'CONFLICT', 'Built-in roles cannot be deleted')
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
