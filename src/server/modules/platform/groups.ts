import { ForbiddenError, type PlatformContext } from '@/server/context'
import { audit } from '@/server/audit'

/** Thrown for mistakes the console should show back to the operator. */
export class GroupError extends Error {}

function guard(ctx: PlatformContext) {
  if (!ctx.user.permissions.has('platform.tenants')) throw new ForbiddenError('Missing permission: platform.tenants')
}

export async function listGroups(ctx: PlatformContext) {
  guard(ctx)
  return ctx.db.schoolGroup.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      createdAt: true,
      tenants: { where: { archivedAt: null }, select: { id: true, name: true, school: { select: { name: true } } } },
      _count: { select: { owners: true } },
    },
  })
}

export async function getGroup(ctx: PlatformContext, id: string) {
  guard(ctx)
  const group = await ctx.db.schoolGroup.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      tenants: {
        orderBy: { name: 'asc' },
        select: { id: true, name: true, slug: true, status: true, archivedAt: true, school: { select: { name: true } } },
      },
      owners: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              status: true,
              tenantId: true,
            },
          },
        },
      },
    },
  })
  if (!group) return null
  const available = await ctx.db.tenant.findMany({
    where: { groupId: null, archivedAt: null },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, slug: true, school: { select: { name: true } } },
  })
  return { group, available }
}

export async function createGroup(ctx: PlatformContext, name: string) {
  guard(ctx)
  const group = await ctx.db.schoolGroup.create({ data: { name: name.trim() } })
  await audit({
    tenantId: null,
    actorId: ctx.user.userId,
    action: 'group.create',
    module: 'platform',
    entityType: 'SchoolGroup',
    entityId: group.id,
    summary: `Created school group ${group.name}`,
  })
  return group
}

export async function renameGroup(ctx: PlatformContext, id: string, name: string) {
  guard(ctx)
  await ctx.db.schoolGroup.update({ where: { id }, data: { name: name.trim() } })
}

export async function deleteGroup(ctx: PlatformContext, id: string) {
  guard(ctx)
  const group = await ctx.db.schoolGroup.delete({ where: { id } })
  await audit({
    tenantId: null,
    actorId: ctx.user.userId,
    action: 'group.delete',
    module: 'platform',
    entityType: 'SchoolGroup',
    entityId: id,
    summary: `Deleted school group ${group.name}`,
  })
}

export async function addSchoolToGroup(ctx: PlatformContext, groupId: string, tenantId: string) {
  guard(ctx)
  const tenant = await ctx.db.tenant.findUnique({ where: { id: tenantId }, select: { groupId: true, name: true, archivedAt: true } })
  if (!tenant || tenant.archivedAt) throw new GroupError('School not found')
  if (tenant.groupId && tenant.groupId !== groupId) throw new GroupError(`${tenant.name} is already in another group`)
  await ctx.db.tenant.update({ where: { id: tenantId }, data: { groupId } })
  await audit({
    tenantId,
    actorId: ctx.user.userId,
    action: 'group.school.add',
    module: 'platform',
    entityType: 'SchoolGroup',
    entityId: groupId,
    summary: `Added ${tenant.name} to a school group`,
  })
}

/** Also drops owner links held through that school's accounts. */
export async function removeSchoolFromGroup(ctx: PlatformContext, groupId: string, tenantId: string) {
  guard(ctx)
  await ctx.db.$transaction([
    ctx.db.schoolGroupOwner.deleteMany({ where: { groupId, user: { tenantId } } }),
    ctx.db.tenant.updateMany({ where: { id: tenantId, groupId }, data: { groupId: null } }),
  ])
  await audit({
    tenantId,
    actorId: ctx.user.userId,
    action: 'group.school.remove',
    module: 'platform',
    entityType: 'SchoolGroup',
    entityId: groupId,
    summary: 'Removed school from its group',
  })
}

/**
 * Links an existing account at one of the group's schools as an owner. The
 * owner keeps signing in to that school; the link adds the group overview.
 */
export async function addGroupOwner(ctx: PlatformContext, groupId: string, tenantId: string, identifier: string) {
  guard(ctx)
  const tenant = await ctx.db.tenant.findUnique({
    where: { id: tenantId },
    select: { groupId: true, status: true, archivedAt: true },
  })
  if (!tenant || tenant.groupId !== groupId) throw new GroupError('Pick a school that is in this group')
  if (tenant.status === 'SUSPENDED' || tenant.archivedAt) {
    throw new GroupError('That school is suspended, so nobody can sign in there. Pick the school the owner uses')
  }
  const value = identifier.trim()
  if (!value) throw new GroupError('Enter the owner’s email or phone number')
  const user = await ctx.db.user.findFirst({
    where: {
      tenantId,
      deletedAt: null,
      OR: [{ email: { equals: value, mode: 'insensitive' } }, { phone: value }],
    },
    select: { id: true, firstName: true, lastName: true, status: true },
  })
  if (!user) throw new GroupError('No account with that email or phone at this school')
  if (user.status !== 'ACTIVE') throw new GroupError('That account is not active')
  await ctx.db.schoolGroupOwner.upsert({
    where: { groupId_userId: { groupId, userId: user.id } },
    create: { groupId, userId: user.id },
    update: {},
  })
  await audit({
    tenantId,
    actorId: ctx.user.userId,
    action: 'group.owner.add',
    module: 'platform',
    entityType: 'SchoolGroupOwner',
    entityId: user.id,
    summary: `Made ${user.firstName} ${user.lastName} a group owner`,
  })
}

export async function removeGroupOwner(ctx: PlatformContext, groupId: string, ownerId: string) {
  guard(ctx)
  const link = await ctx.db.schoolGroupOwner.findFirst({
    where: { id: ownerId, groupId },
    select: { userId: true, user: { select: { tenantId: true, firstName: true, lastName: true } } },
  })
  if (!link) return
  await ctx.db.schoolGroupOwner.delete({ where: { id: ownerId } })
  await audit({
    tenantId: link.user.tenantId,
    actorId: ctx.user.userId,
    action: 'group.owner.remove',
    module: 'platform',
    entityType: 'SchoolGroupOwner',
    entityId: link.userId,
    summary: `Removed ${link.user.firstName} ${link.user.lastName} as a group owner`,
  })
}
