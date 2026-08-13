import { requireContext } from '@/server/context'
import { listUsers, userCounts } from '@/server/modules/settings/users'
import { listRoles } from '@/server/modules/settings/roles'
import { parseListQuery } from '@/lib/query'
import { formatDay } from '@/lib/dates'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { Metric, MetricRow } from '@/components/ui/metric'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { SearchBar } from '@/components/search-bar'
import { Pagination } from '@/components/pagination'
import { UserFilters, UserRow } from './controls'

export const metadata = { title: 'Users' }

const STATUS_TONE: Record<string, BadgeTone> = {
  ACTIVE: 'success',
  INVITED: 'info',
  DISABLED: 'neutral',
}

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
      <PageHeader
        title="Users"
        description={`${total} accounts · staff, parents and students who can sign in`}
        breadcrumbs={[{ label: 'Settings', href: '/settings' }, { label: 'Users' }]}
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
        <SearchBar placeholder="Search name, email or phone" />
        <UserFilters roles={roleOptions} roleId={params.roleId ?? ''} status={params.status ?? ''} />

        {rows.length === 0 ? (
          <EmptyState
            title={params.q ? 'Nothing matches that search' : 'No accounts'}
            description="Accounts are created when staff, students and parents are added to the school."
          />
        ) : (
          <>
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <TH>Person</TH>
                    <TH>Roles</TH>
                    <TH>Status</TH>
                    <TH align="right">Last signed in</TH>
                    {canEdit || canAssign ? <TH align="right">&nbsp;</TH> : null}
                  </tr>
                </THead>
                <TBody>
                  {rows.map((user) => (
                    <TR key={user.id}>
                      <TD>
                        <span className="block text-sm text-ink">
                          {user.firstName} {user.lastName}
                          {user.mfaEnabled ? (
                            <span className="ml-1.5 text-xs text-success">2FA</span>
                          ) : null}
                        </span>
                        <span className="block text-xs text-ink-subtle">
                          {user.email ?? user.phone ?? 'No contact on file'}
                          {user.staff ? ` · staff ${user.staff.employeeCode}` : ''}
                          {user.student ? ` · student ${user.student.admissionNo}` : ''}
                          {user.parent ? ' · parent' : ''}
                        </span>
                      </TD>
                      <TD>
                        {user.roles.length === 0 ? (
                          <span className="text-sm text-warning">No role</span>
                        ) : (
                          <span className="flex flex-wrap gap-1">
                            {user.roles.map((r) => (
                              <Badge key={r.role.id} tone="neutral">
                                {r.role.name}
                              </Badge>
                            ))}
                          </span>
                        )}
                      </TD>
                      <TD>
                        <Badge tone={STATUS_TONE[user.status] ?? 'neutral'}>
                          {user.status.toLowerCase()}
                        </Badge>
                        {user.lockedUntil && user.lockedUntil > new Date() ? (
                          <span className="ml-1.5 text-xs text-[var(--danger)]">locked out</span>
                        ) : null}
                      </TD>
                      <TD align="right" className="text-sm tnum text-ink-muted">
                        {user.lastLoginAt ? (
                          formatDay(user.lastLoginAt)
                        ) : (
                          <span className="text-ink-subtle">Never</span>
                        )}
                      </TD>
                      {canEdit || canAssign ? (
                        <TD align="right">
                          <UserRow
                            id={user.id}
                            name={`${user.firstName} ${user.lastName}`}
                            status={user.status}
                            roleIds={user.roles.map((r) => r.role.id)}
                            roles={roleOptions}
                            canEdit={canEdit}
                            canAssign={canAssign}
                            isSelf={user.id === ctx.user.userId}
                          />
                        </TD>
                      ) : null}
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
            <Pagination
              total={total}
              page={query.page}
              pageSize={query.pageSize}
              label="accounts"
            />
          </>
        )}
      </Card>
    </div>
  )
}
