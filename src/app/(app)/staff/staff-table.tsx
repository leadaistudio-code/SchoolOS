'use client'

import * as React from 'react'
import Link from 'next/link'
import { FileDown, KeyRound, MessageSquare } from 'lucide-react'
import type { StaffRow } from '@/server/modules/people/service'
import { BulkSelectionBar, downloadCsv, useBulkSelection } from '@/components/bulk-selection'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { Checkbox } from '@/components/ui/input'
import { PersonCell } from '@/components/ui/identity'
import { Pagination } from '@/components/pagination'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { useToast } from '@/components/ui/toast'
import { bulkIssueStaffTempPasswordsAction } from './actions'

function downloadTempPasswordCsv(
  issued: {
    name: string
    employeeCode: string
    phone: string
    password: string
    expiresAt: string
    createdLogin: boolean
  }[],
) {
  downloadCsv(
    'staff-temp-passwords.csv',
    ['Staff member', 'Employee code', 'Phone (username)', 'Temporary password', 'Expires', 'Login'],
    issued.map((row) => [
      row.name,
      row.employeeCode,
      row.phone,
      row.password,
      row.expiresAt,
      row.createdLogin ? 'Created' : 'Reset',
    ]),
  )
}

export function StaffTable({
  rows,
  total,
  page,
  pageSize,
  canExport,
  canMessage,
  canBroadcast,
  canTempPassword,
  staffTypeFilter,
}: {
  rows: StaffRow[]
  total: number
  page: number
  pageSize: number
  canExport: boolean
  canMessage: boolean
  canBroadcast: boolean
  canTempPassword: boolean
  staffTypeFilter?: string
}) {
  const toast = useToast()
  const [pending, startTransition] = React.useTransition()
  const selection = useBulkSelection(rows.map((row) => row.id))
  const selectedRows = rows.filter((row) => selection.selected.has(row.id))
  const recipientIds = selectedRows.flatMap((row) => (row.userId ? [row.userId] : []))

  const runTempPasswords = (scope: 'selected' | 'all') => {
    const count = scope === 'all' ? total : selection.selected.size
    if (count === 0) return
    const capped = scope === 'all' && count > 150
    const label =
      scope === 'all'
        ? `Generate temporary passwords for ${capped ? 'the first 150 of ' : ''}${count} staff member${count === 1 ? '' : 's'}${staffTypeFilter ? ' in this filter' : ''}?`
        : `Generate temporary passwords for ${count} selected staff member${count === 1 ? '' : 's'}?`
    if (
      !window.confirm(
        `${label}\n\nA CSV downloads with one-time passwords (valid 24 hours). They are not stored and cannot be shown again.`,
      )
    ) {
      return
    }

    startTransition(async () => {
      const result = await bulkIssueStaffTempPasswordsAction(
        scope === 'all'
          ? { all: true, staffType: staffTypeFilter }
          : { staffIds: selection.selectedIds },
      )
      if (!result.ok || !result.data) {
        toast.push({
          tone: 'error',
          title: 'Could not issue passwords',
          description: result.message,
        })
        return
      }
      if (result.data.issued.length > 0) {
        downloadTempPasswordCsv(result.data.issued)
      }
      toast.push({
        tone: result.data.issued.length > 0 ? 'success' : 'error',
        title:
          result.data.issued.length > 0
            ? 'Temporary passwords ready'
            : 'No passwords issued',
        description: result.message,
      })
      if (scope === 'selected') selection.clear()
    })
  }

  return (
    <>
      {canTempPassword && total > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
          <span className="mr-auto text-sm text-ink-muted">
            Hand out 24-hour temporary passwords (CSV). Creates a login when missing.
          </span>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            loading={pending}
            onClick={() => runTempPasswords('all')}
          >
            <KeyRound aria-hidden />
            Temp passwords for all{total > 1 ? ` (${total})` : ''}
          </Button>
        </div>
      ) : null}
      <BulkSelectionBar count={selection.selected.size} noun="staff member" onClear={selection.clear}>
        {canExport ? (
          <button
            type="button"
            className={buttonVariants({ size: 'sm', variant: 'secondary' })}
            onClick={() =>
              downloadCsv(
                'staff-selected.csv',
                ['Staff member', 'Employee code', 'Type', 'Designation', 'Department', 'Phone', 'Email'],
                selectedRows.map((row) => [
                  `${row.firstName} ${row.lastName}`,
                  row.employeeCode,
                  row.staffType,
                  row.designation,
                  row.department,
                  row.phone,
                  row.email,
                ]),
              )
            }
          >
            <FileDown aria-hidden />
            Export
          </button>
        ) : null}
        {canTempPassword ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            loading={pending}
            onClick={() => runTempPasswords('selected')}
          >
            <KeyRound aria-hidden />
            Temp passwords
          </Button>
        ) : null}
        {canMessage && recipientIds.length > 0 && (recipientIds.length === 1 || canBroadcast) ? (
          <Link
            href={`/communication/messages?compose=1&to=${encodeURIComponent(recipientIds.join(','))}`}
            className={buttonVariants({ size: 'sm' })}
          >
            <MessageSquare aria-hidden />
            Message {recipientIds.length}
          </Link>
        ) : null}
      </BulkSelectionBar>
      <TableWrap>
        <Table>
          <THead>
            <tr>
              <TH>
                <Checkbox
                  checked={selection.allSelected}
                  onChange={selection.toggleAll}
                  aria-label="Select all staff on this page"
                />
              </TH>
              <TH>Staff member</TH>
              <TH>Role</TH>
              <TH>Contact</TH>
              <TH>Assignments</TH>
              <TH>Login</TH>
              <TH align="right">
                <span className="sr-only">Actions</span>
              </TH>
            </tr>
          </THead>
          <TBody>
            {rows.map((staff) => (
              <TR key={staff.id}>
                <TD>
                  <Checkbox
                    checked={selection.selected.has(staff.id)}
                    onChange={() => selection.toggle(staff.id)}
                    aria-label={`Select ${staff.firstName} ${staff.lastName}`}
                  />
                </TD>
                <TD>
                  <PersonCell
                    firstName={staff.firstName}
                    lastName={staff.lastName}
                    secondary={staff.employeeCode}
                    href={`/staff/${staff.id}`}
                  />
                </TD>
                <TD>
                  <span className="block text-sm text-ink first-letter:uppercase">
                    {staff.designation ?? staff.staffType.toLowerCase()}
                  </span>
                  {staff.department ? (
                    <span className="block text-xs text-ink-subtle">{staff.department}</span>
                  ) : null}
                </TD>
                <TD className="text-sm text-ink-muted">
                  {staff.phone ? <span className="block">{staff.phone}</span> : null}
                  {staff.email ? (
                    <span className="block max-w-52 truncate text-xs text-ink-subtle">{staff.email}</span>
                  ) : null}
                  {!staff.phone && !staff.email ? '—' : null}
                </TD>
                <TD className="text-sm text-ink-muted">
                  {staff.isClassTeacherOf ? (
                    <span className="block">Class teacher · {staff.isClassTeacherOf}</span>
                  ) : null}
                  <span className="block text-xs text-ink-subtle">
                    {staff.classCount} subject{staff.classCount === 1 ? '' : 's'}
                  </span>
                </TD>
                <TD>
                  <Badge tone={staff.hasLogin ? 'success' : 'neutral'}>
                    {staff.hasLogin ? 'Active' : 'No login'}
                  </Badge>
                </TD>
                <TD align="right">
                  <Link href={`/staff/${staff.id}`} className="text-sm text-[var(--brand-600)] hover:underline">
                    View
                  </Link>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </TableWrap>
      <Pagination total={total} page={page} pageSize={pageSize} label="staff" />
    </>
  )
}
