'use client'

import * as React from 'react'
import { LockKeyhole, UnlockKeyhole } from 'lucide-react'
import { bulkSetUserStatusAction } from '../admin-actions'
import { BulkSelectionBar, useBulkSelection } from '@/components/bulk-selection'
import { Pagination } from '@/components/pagination'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/input'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { useToast } from '@/components/ui/toast'
import { formatDay } from '@/lib/dates'
import { UserRow, type RoleOption } from './controls'

type UserTableRow = {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  status: string
  lastLoginAt: string | null
  mfaEnabled: boolean
  lockedUntil: string | null
  roles: { id: string; name: string }[]
  staffCode: string | null
  admissionNo: string | null
  isParent: boolean
}

const STATUS_TONE: Record<string, BadgeTone> = {
  ACTIVE: 'success',
  INVITED: 'info',
  DISABLED: 'neutral',
}

export function UserTable({
  rows,
  total,
  page,
  pageSize,
  roles,
  canEdit,
  canAssign,
  currentUserId,
}: {
  rows: UserTableRow[]
  total: number
  page: number
  pageSize: number
  roles: RoleOption[]
  canEdit: boolean
  canAssign: boolean
  currentUserId: string
}) {
  const toast = useToast()
  const [pending, startTransition] = React.useTransition()
  const selectableIds = canEdit
    ? rows.filter((user) => user.id !== currentUserId).map((user) => user.id)
    : []
  const selection = useBulkSelection(selectableIds)

  const setStatus = (status: 'ACTIVE' | 'DISABLED') => {
    const verb = status === 'DISABLED' ? 'disable' : 'enable'
    const warning =
      status === 'DISABLED'
        ? '\n\nAll active sessions for these accounts will be revoked immediately.'
        : ''
    if (!window.confirm(`${verb[0]!.toUpperCase()}${verb.slice(1)} ${selection.selected.size} selected account(s)?${warning}`)) {
      return
    }
    startTransition(async () => {
      const result = await bulkSetUserStatusAction({ ids: selection.selectedIds, status })
      toast.push({
        tone: result.ok ? 'success' : 'error',
        title: result.ok ? 'Accounts updated' : 'Some accounts were protected',
        description: result.message,
      })
      if (result.ok) selection.clear()
    })
  }

  return (
    <>
      {canEdit ? (
        <BulkSelectionBar count={selection.selected.size} noun="account" onClear={selection.clear}>
          <Button size="sm" variant="secondary" loading={pending} onClick={() => setStatus('ACTIVE')}>
            <UnlockKeyhole aria-hidden />
            Enable
          </Button>
          <Button size="sm" variant="secondary" loading={pending} onClick={() => setStatus('DISABLED')}>
            <LockKeyhole aria-hidden />
            Disable
          </Button>
        </BulkSelectionBar>
      ) : null}
      <TableWrap>
        <Table>
          <THead>
            <tr>
              {canEdit ? (
                <TH>
                  <Checkbox
                    aria-label="Select all manageable accounts"
                    checked={selection.allSelected}
                    onChange={selection.toggleAll}
                    disabled={selectableIds.length === 0}
                  />
                </TH>
              ) : null}
              <TH>Person</TH>
              <TH>Roles</TH>
              <TH>Status</TH>
              <TH align="right">Last signed in</TH>
              {canEdit || canAssign ? <TH align="right">&nbsp;</TH> : null}
            </tr>
          </THead>
          <TBody>
            {rows.map((user) => {
              const isSelf = user.id === currentUserId
              return (
                <TR key={user.id}>
                  {canEdit ? (
                    <TD>
                      <Checkbox
                        aria-label={`Select ${user.firstName} ${user.lastName}`}
                        checked={selection.selected.has(user.id)}
                        onChange={() => selection.toggle(user.id)}
                        disabled={isSelf}
                      />
                    </TD>
                  ) : null}
                  <TD>
                    <span className="block text-sm text-ink">
                      {user.firstName} {user.lastName}
                      {user.mfaEnabled ? (
                        <span className="ml-1.5 text-xs text-success">2FA</span>
                      ) : null}
                    </span>
                    <span className="block text-xs text-ink-subtle">
                      {user.email ?? user.phone ?? 'No contact on file'}
                      {user.staffCode ? ` · staff ${user.staffCode}` : ''}
                      {user.admissionNo ? ` · student ${user.admissionNo}` : ''}
                      {user.isParent ? ' · parent' : ''}
                    </span>
                  </TD>
                  <TD>
                    {user.roles.length === 0 ? (
                      <span className="text-sm text-warning">No role</span>
                    ) : (
                      <span className="flex flex-wrap gap-1">
                        {user.roles.map((role) => (
                          <Badge key={role.id} tone="neutral">{role.name}</Badge>
                        ))}
                      </span>
                    )}
                  </TD>
                  <TD>
                    <Badge tone={STATUS_TONE[user.status] ?? 'neutral'}>
                      {user.status.toLowerCase()}
                    </Badge>
                    {user.lockedUntil && new Date(user.lockedUntil) > new Date() ? (
                      <span className="ml-1.5 text-xs text-[var(--danger)]">locked out</span>
                    ) : null}
                  </TD>
                  <TD align="right" className="text-sm tnum text-ink-muted">
                    {user.lastLoginAt
                      ? formatDay(new Date(user.lastLoginAt))
                      : <span className="text-ink-subtle">Never</span>}
                  </TD>
                  {canEdit || canAssign ? (
                    <TD align="right">
                      <UserRow
                        id={user.id}
                        name={`${user.firstName} ${user.lastName}`}
                        status={user.status}
                        roleIds={user.roles.map((role) => role.id)}
                        roles={roles}
                        canEdit={canEdit}
                        canAssign={canAssign}
                        isSelf={isSelf}
                      />
                    </TD>
                  ) : null}
                </TR>
              )
            })}
          </TBody>
        </Table>
      </TableWrap>
      <Pagination total={total} page={page} pageSize={pageSize} label="accounts" />
    </>
  )
}
