import Link from 'next/link'
import { requireContext } from '@/server/context'
import { listRoles, permissionCatalogue } from '@/server/modules/settings/roles'
import { SettingsPageHeader, SettingsPanelHeader } from '@/components/settings/settings-page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { NewRoleButton, RoleControls, RolePermissionViewer } from './controls'

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
  const canViewUsers = ctx.can('users.view')

  const system = roles.filter((r) => r.isSystem)
  const custom = roles.filter((r) => !r.isSystem)

  const copyOptions = roles.map((r) => ({ id: r.id, label: r.name }))
  const totalPermissions = catalogue.reduce((sum, m) => sum + m.permissions.length, 0)

  return (
    <div className="space-y-4">
      <SettingsPageHeader
        title="Roles and permissions"
        description={`${roles.length} roles · ${totalPermissions} permissions available`}
        actions={canManage ? <NewRoleButton copyFrom={copyOptions} /> : null}
        icon="KeyRound"
        tone="warning"
      />

      <Card className="overflow-hidden">
        <SettingsPanelHeader
          title="Built-in roles"
          description="Shared across the platform — copy one to change it."
          icon="KeyRound"
          tone="brand"
        />
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
                  <TD>
                    <RolePermissionViewer
                      name={role.name}
                      description={role.description}
                      members={role._count.users}
                      isSystem
                      catalogue={catalogue}
                      granted={role.permissions.map((permission) => permission.permission.key)}
                    />
                    <Badge tone="neutral" className="ml-2">
                      built-in
                    </Badge>
                  </TD>
                  <TD className="text-sm text-ink-muted">{role.description ?? '—'}</TD>
                  <TD align="right" className="text-sm tnum">
                    {role.permissions.length}
                  </TD>
                  <TD align="right">
                    {canViewUsers ? (
                      <Link
                        href={`/settings/users?roleId=${role.id}&status=CURRENT`}
                        className="inline-flex min-w-8 items-center justify-center rounded-full bg-[var(--product-50)] px-2.5 py-1 text-sm font-semibold text-[var(--product-600)] tnum hover:bg-[var(--product-100)] hover:underline"
                        aria-label={`View ${role._count.users} people with the ${role.name} role`}
                      >
                        {role._count.users}
                      </Link>
                    ) : (
                      <span className="text-sm tnum">{role._count.users}</span>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrap>
      </Card>

      <Card className="overflow-hidden">
        <SettingsPanelHeader
          title="Your school’s roles"
          description="Editable roles visible only to this school."
          icon="KeyRound"
          tone="warning"
        />
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
                    <TD>
                      <RolePermissionViewer
                        name={role.name}
                        description={role.description}
                        members={role._count.users}
                        isSystem={false}
                        catalogue={catalogue}
                        granted={role.permissions.map((permission) => permission.permission.key)}
                      />
                    </TD>
                    <TD className="text-sm text-ink-muted">{role.description ?? '—'}</TD>
                    <TD align="right" className="text-sm tnum">
                      {role.permissions.length}
                    </TD>
                    <TD align="right">
                      {canViewUsers ? (
                        <Link
                          href={`/settings/users?roleId=${role.id}&status=CURRENT`}
                          className="inline-flex min-w-8 items-center justify-center rounded-full bg-[var(--product-50)] px-2.5 py-1 text-sm font-semibold text-[var(--product-600)] tnum hover:bg-[var(--product-100)] hover:underline"
                          aria-label={`View ${role._count.users} people with the ${role.name} role`}
                        >
                          {role._count.users}
                        </Link>
                      ) : (
                        <span className="text-sm tnum">{role._count.users}</span>
                      )}
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
