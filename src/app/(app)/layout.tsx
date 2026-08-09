import { redirect } from 'next/navigation'
import { getContext } from '@/server/context'
import { getEntitlements } from '@/server/entitlements'
import { NAVIGATION, visibleNavigation } from '@/lib/navigation'
import { AppShell } from '@/components/shell/app-shell'
import { ROLE_BY_KEY } from '@/lib/rbac/roles'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getContext()
  if (!ctx) redirect('/login')

  const entitlements = await getEntitlements(ctx.tenant.id)

  const navigation = visibleNavigation(NAVIGATION, {
    can: ctx.can,
    hasFeature: (feature) => entitlements[feature]?.enabled ?? false,
  })

  const unreadCount = await ctx.db.notification.count({
    where: { userId: ctx.user.userId, readAt: null },
  })

  const primaryRole = ctx.user.roleKeys[0]
  const roleLabel = primaryRole
    ? (ROLE_BY_KEY.get(primaryRole as never)?.name ?? primaryRole)
    : 'Member'

  return (
    <AppShell
      navigation={navigation}
      schoolName={ctx.tenant.school?.name ?? ctx.tenant.name}
      logoUrl={ctx.tenant.school?.logoUrl ?? null}
      unreadCount={unreadCount}
      user={{
        firstName: ctx.user.firstName,
        lastName: ctx.user.lastName,
        email: ctx.user.email,
        roleLabel,
        avatarUrl: ctx.user.avatarUrl,
        impersonated: !!ctx.user.impersonatedById,
      }}
    >
      {children}
    </AppShell>
  )
}
