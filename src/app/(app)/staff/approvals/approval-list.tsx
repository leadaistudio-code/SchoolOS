'use client'

import * as React from 'react'
import Link from 'next/link'
import { differenceInCalendarDays } from 'date-fns'
import { Check, X } from 'lucide-react'
import { bulkDecideLeaveAction } from '../../leave/actions'
import { BulkSelectionBar, useBulkSelection } from '@/components/bulk-selection'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { formatDay } from '@/lib/dates'
import { LeaveDecision } from '../leave-decision'

type ApprovalRow = {
  id: string
  fromDate: string
  toDate: string
  reason: string
  staff: {
    id: string
    firstName: string
    lastName: string
    designation: string | null
    employeeCode: string
  } | null
  leaveType: {
    name: string
    isPaid: boolean
  } | null
}

export function ApprovalList({
  rows,
  canDecide,
}: {
  rows: ApprovalRow[]
  canDecide: boolean
}) {
  const toast = useToast()
  const [pending, startTransition] = React.useTransition()
  const selection = useBulkSelection(rows.map((row) => row.id))
  const today = new Date()
  const days = (from: Date, to: Date) => differenceInCalendarDays(to, from) + 1

  const decide = (status: 'APPROVED' | 'REJECTED') => {
    let note: string | undefined
    if (status === 'REJECTED') {
      const entered = window.prompt('Reason for rejecting the selected leave requests?')
      if (!entered?.trim()) return
      note = entered.trim()
    }
    startTransition(async () => {
      const result = await bulkDecideLeaveAction(selection.selectedIds, status, note)
      toast.push({
        tone: result.ok ? 'success' : 'error',
        title: result.ok ? 'Requests updated' : 'Some requests could not be updated',
        description: result.message,
      })
      if (result.ok) selection.clear()
    })
  }

  return (
    <>
      {canDecide ? (
        <BulkSelectionBar count={selection.selected.size} noun="request" onClear={selection.clear}>
          <Button size="sm" loading={pending} onClick={() => decide('APPROVED')}>
            <Check aria-hidden />
            Approve selected
          </Button>
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => decide('REJECTED')}>
            <X aria-hidden />
            Reject selected
          </Button>
        </BulkSelectionBar>
      ) : null}
      {canDecide ? (
        <div className="border-b border-line px-4 py-2">
          <label className="inline-flex items-center gap-2 text-sm font-medium text-ink">
            <Checkbox
              checked={selection.allSelected}
              onChange={selection.toggleAll}
              aria-label="Select all pending leave requests"
            />
            Select all {rows.length} pending requests
          </label>
        </div>
      ) : null}
      <ul className="divide-y divide-[var(--border)]">
        {rows.map((leave) => {
          const fromDate = new Date(leave.fromDate)
          const toDate = new Date(leave.toDate)
          const started = fromDate <= today
          return (
            <li key={leave.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                {canDecide ? (
                  <Checkbox
                    checked={selection.selected.has(leave.id)}
                    onChange={() => selection.toggle(leave.id)}
                    aria-label={`Select leave request from ${leave.staff?.firstName ?? 'staff member'}`}
                    className="mr-1"
                  />
                ) : null}
                <Link href={`/staff/${leave.staff?.id}`} className="text-base font-medium text-ink hover:underline">
                  {leave.staff?.firstName} {leave.staff?.lastName}
                </Link>
                <span className="text-xs text-ink-subtle">
                  {leave.staff?.designation ?? leave.staff?.employeeCode}
                </span>
                {leave.leaveType ? (
                  <Badge tone={leave.leaveType.isPaid ? 'neutral' : 'warning'}>
                    {leave.leaveType.name}{leave.leaveType.isPaid ? '' : ' · unpaid'}
                  </Badge>
                ) : null}
                {started ? <Badge tone="danger">already started</Badge> : null}
                <span className="ml-auto text-xs tnum text-ink-subtle">
                  {formatDay(fromDate)} – {formatDay(toDate)} · {days(fromDate, toDate)} days
                </span>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink-muted">{leave.reason}</p>
              {canDecide ? (
                <div className="mt-3"><LeaveDecision id={leave.id} /></div>
              ) : (
                <p className="mt-2 text-xs text-ink-subtle">You can see requests but not decide them.</p>
              )}
            </li>
          )
        })}
      </ul>
    </>
  )
}
