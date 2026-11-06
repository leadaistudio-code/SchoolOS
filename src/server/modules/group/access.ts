import { redirect } from 'next/navigation'
import { prisma } from '@/server/db/prisma'
import { requireContext, type AppContext } from '@/server/context'

export type GroupSchool = { tenantId: string; name: string; slug: string; status: string }
export type GroupScope = { groupId: string; groupName: string; schools: GroupSchool[] }

/**
 * The schools this user may see combined, or null.
 *
 * Reads across tenants with the unscoped client, which is why the only key is
 * an explicit owner link set from the platform console: no role or permission
 * opens it, and a support session impersonating the owner does not either.
 */
export async function groupScopeFor(ctx: AppContext): Promise<GroupScope | null> {
  if (ctx.user.impersonatedById) return null
  const tenant = await prisma.tenant.findUnique({ where: { id: ctx.tenant.id }, select: { groupId: true } })
  if (!tenant?.groupId) return null
  const link = await prisma.schoolGroupOwner.findUnique({
    where: { groupId_userId: { groupId: tenant.groupId, userId: ctx.user.userId } },
    select: {
      group: {
        select: {
          id: true,
          name: true,
          tenants: {
            where: { archivedAt: null },
            orderBy: { name: 'asc' },
            select: { id: true, name: true, slug: true, status: true, school: { select: { name: true } } },
          },
        },
      },
    },
  })
  if (!link) return null
  return {
    groupId: link.group.id,
    groupName: link.group.name,
    schools: link.group.tenants.map((t) => ({
      tenantId: t.id,
      name: t.school?.name ?? t.name,
      slug: t.slug,
      status: t.status,
    })),
  }
}

export async function isGroupOwner(ctx: AppContext): Promise<boolean> {
  return (await groupScopeFor(ctx)) !== null
}

export async function requireGroupOwner() {
  const ctx = await requireContext()
  const scope = await groupScopeFor(ctx)
  if (!scope) redirect('/403')
  return { ctx, scope }
}
