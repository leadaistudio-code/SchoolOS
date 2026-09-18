import { requireContext } from '@/server/context'
import { listUsers, userCounts } from '@/server/modules/settings/users'
import { listRoles } from '@/server/modules/settings/roles'
import { parseListQuery } from '@/lib/query'
import { SettingsPageHeader, SettingsPanelHeader } from '@/components/settings/settings-page-header'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { Metric, MetricRow } from '@/components/ui/metric'
import { SearchBar } from '@/components/search-bar'
import { UserFilters } from './controls'
import { UserTable } from './user-table'

export const metadata = { title: 'Users' }

/**
 * Portal accounts.
 *
 * Staff, parents and students are one table because they are one thing —
 * somebody who can sign in — and the question this page exists to answer is
 * "who has access", which a split by person-type cannot answer without three
 * lookups. What each account *is* shows as a chip on the row instead.
 */
export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireContext('users.view')
  const params = await searchParams
  const query = parseListQuery(params)

  const [{ rows, total }, counts, roles] = await Promise.all([
    listUsers(ctx, query, { roleId: params.roleId, status: params.status }),
    userCounts(ctx),
    ctx.can('roles.view') ? listRoles(ctx) : Promise.resolve([]),
  ])

  const canEdit = ctx.can('users.edit')
  const canAssign = ctx.can('users.roles')
  const roleOptions = roles.map((r) => ({ id: r.id, label: r.name }))

  return (
    <div className="space-y-4">
      <SettingsPageHeader
        title="Users"
        description={`${total} accounts · staff, parents and students who can sign in`}
        icon="UserCog"
        tone="info"
      />

      <MetricRow>
        <Metric label="Active" value={String(counts.byStatus.ACTIVE ?? 0)} sub="Can sign in now" />
        <Metric
          label="Invited"
          value={String(counts.byStatus.INVITED ?? 0)}
          sub="Account made, not yet used"
        />
        <Metric
          label="Never signed in"
          value={String(counts.neverSignedIn)}
          sub="Across active and invited"
          emphasis={counts.neverSignedIn > 0 ? 'warning' : undefined}
        />
        <Metric
          label="Disabled"
          value={String(counts.byStatus.DISABLED ?? 0)}
          sub="Access revoked"
        />
      </MetricRow>

      <Card className="overflow-hidden">
        <SettingsPanelHeader
          title="Portal access"
          description="Search accounts, review roles and manage sign-in access."
          icon="UserCog"
          tone="info"
        />
        <SearchBar placeholder="Search name, email or phone" />
        <UserFilters roles={roleOptions} roleId={params.roleId ?? ''} status={params.status ?? ''} />

        {rows.length === 0 ? (
          <EmptyState
            title={params.q ? 'Nothing matches that search' : 'No accounts'}
            description="Accounts are created when staff, students and parents are added to the school."
          />
        ) : (
          <UserTable
            rows={rows.map((user) => ({
              id: user.id,
              firstName: user.firstName,
              lastName: user.lastName,
              email: user.email,
              phone: user.phone,
              status: user.status,
              lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
              mfaEnabled: user.mfaEnabled,
              lockedUntil: user.lockedUntil?.toISOString() ?? null,
              roles: user.roles.map(({ role }) => ({
                id: role.id,
                name: role.name,
              })),
              staffCode: user.staff?.employeeCode ?? null,
              admissionNo: user.student?.admissionNo ?? null,
              isParent: !!user.parent,
            }))}
            total={total}
            page={query.page}
            pageSize={query.pageSize}
            roles={roleOptions}
            canEdit={canEdit}
            canAssign={canAssign}
            currentUserId={ctx.user.userId}
          />
        )}
      </Card>
    </div>
  )
}
