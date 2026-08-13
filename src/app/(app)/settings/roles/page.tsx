import { requireContext } from '@/server/context'
import { listRoles, permissionCatalogue } from '@/server/modules/settings/roles'
import { PageHeader } from '@/components/page-header'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { NewRoleButton, RoleControls } from './controls'

export const metadata = { title: 'Roles and permissions' }

/**
 * Roles and permissions.
 *
 * Built-in roles are listed but not editable: they are shared by every school
 * on the platform, so changing "Teacher" here would change it everywhere. A
 * school that wants a different shape copies one — the dialog offers exactly
 * that — and edits the copy.
 *
 * The member count sits next to each role because the real question when
 * changing permissions is how many people it affects.
 */
export default async function RolesPage() {
  const ctx = await requireContext('roles.view')
  const [roles, catalogue] = await Promise.all([
    listRoles(ctx),
    Promise.resolve(permissionCatalogue()),
  ])
  const canManage = ctx.can('roles.manage')

  const system = roles.filter((r) => r.isSystem)
  const custom = roles.filter((r) => !r.isSystem)

  const copyOptions = roles.map((r) => ({ id: r.id, label: r.name }))
  const totalPermissions = catalogue.reduce((sum, m) => sum + m.permissions.length, 0)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Roles and permissions"
        description={`${roles.length} roles · ${totalPermissions} permissions available`}
        breadcrumbs={[{ label: 'Settings', href: '/settings' }, { label: 'Roles' }]}
        actions={canManage ? <NewRoleButton copyFrom={copyOptions} /> : null}
      />

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Built-in roles</CardTitle>
          <span className="text-xs text-ink-subtle">
            Shared across the platform — copy one to change it
          </span>
        </CardHeader>
        <TableWrap>
          <Table>
            <THead>
              <tr>
                <TH>Role</TH>
                <TH>What it is for</TH>
                <TH align="right">Permissions</TH>
                <TH align="right">People</TH>
              </tr>
            </THead>
            <TBody>
              {system.map((role) => (
                <TR key={role.id}>
                  <TD className="text-sm font-medium text-ink">
                    {role.name}
                    <Badge tone="neutral" className="ml-2">
                      built-in
                    </Badge>
                  </TD>
                  <TD className="text-sm text-ink-muted">{role.description ?? '—'}</TD>
                  <TD align="right" className="text-sm tnum">
                    {role.permissions.length}
                  </TD>
                  <TD align="right" className="text-sm tnum">
                    {role._count.users}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrap>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Your school&apos;s roles</CardTitle>
          <span className="text-xs text-ink-subtle">Editable, and only visible to this school</span>
        </CardHeader>
        {custom.length === 0 ? (
          <EmptyState
            title="No custom roles"
            description={
              canManage
                ? 'Copy a built-in role when somebody needs a slightly different set of permissions — a head of department, say, or an exam coordinator.'
                : 'This school has not created any roles of its own.'
            }
            action={
              canManage ? (
                <NewRoleButton copyFrom={copyOptions} label="Create the first custom role" />
              ) : undefined
            }
          />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Role</TH>
                  <TH>What it is for</TH>
                  <TH align="right">Permissions</TH>
                  <TH align="right">People</TH>
                  {canManage ? <TH align="right">&nbsp;</TH> : null}
                </tr>
              </THead>
              <TBody>
                {custom.map((role) => (
                  <TR key={role.id}>
                    <TD className="text-sm font-medium text-ink">{role.name}</TD>
                    <TD className="text-sm text-ink-muted">{role.description ?? '—'}</TD>
                    <TD align="right" className="text-sm tnum">
                      {role.permissions.length}
                    </TD>
                    <TD align="right" className="text-sm tnum">
                      {role._count.users}
                    </TD>
                    {canManage ? (
                      <TD align="right">
                        <RoleControls
                          id={role.id}
                          name={role.name}
                          members={role._count.users}
                          catalogue={catalogue}
                          granted={role.permissions.map((p) => p.permission.key)}
                        />
                      </TD>
                    ) : null}
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Card>
    </div>
  )
}
