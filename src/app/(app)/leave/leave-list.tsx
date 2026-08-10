'use client'

import * as React from 'react'
import { formatDay } from '@/lib/dates'
import { format } from 'date-fns'
import { Check, MessageSquare, X } from 'lucide-react'
import { cancelLeaveAction, decideLeaveAction } from './actions'
import type { LeaveRow } from '@/server/modules/leave/service'
import { StatusBadge, humanizeStatus } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'

/**
 * The approval queue.
 *
 * Approving writes LEAVE into the attendance register for the covered school
 * days, so the decision and the register can never disagree — which is why the
 * confirmation says so out loud.
 */
export function LeaveList({ rows, canApprove }: { rows: LeaveRow[]; canApprove: boolean }) {
  const toast = useToast()
  const [pendingId, setPendingId] = React.useState<string | null>(null)
  const [noteFor, setNoteFor] = React.useState<string | null>(null)
  const [note, setNote] = React.useState('')

  const decide = (id: string, status: 'APPROVED' | 'REJECTED') => {
    setPendingId(id)
    void decideLeaveAction(id, status, note || undefined).then((r) => {
      toast.push({
        tone: r.ok ? 'success' : 'error',
        title: r.ok ? `Leave ${status.toLowerCase()}` : 'Could not save',
        description: r.message,
      })
      setPendingId(null)
      setNoteFor(null)
      setNote('')
    })
  }

  const withdraw = (id: string) => {
    setPendingId(id)
    void cancelLeaveAction(id).then((r) => {
      toast.push({
        tone: r.ok ? 'success' : 'error',
        title: r.ok ? 'Withdrawn' : 'Could not withdraw',
        description: r.message,
      })
      setPendingId(null)
    })
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No leave requests"
        description={
          canApprove
            ? 'Requests submitted by staff, students and parents will appear here for approval.'
            : 'Leave you apply for will be listed here with its status.'
        }
      />
    )
  }

  return (
    <ul className="divide-y divide-[var(--border)]">
      {rows.map((r) => (
        <li key={r.id} className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-base font-medium text-ink">
                {r.applicantName}
                <span className="ml-2 text-xs font-normal text-ink-subtle uppercase tracking-wide">
                  {humanizeStatus(r.applicantType)}
                </span>
              </p>
              {r.applicantDetail ? (
                <p className="text-xs text-ink-subtle">{r.applicantDetail}</p>
              ) : null}
              <p className="text-sm text-ink-muted mt-1.5">
                {formatDay(r.fromDate, 'd MMM yyyy')} – {formatDay(r.toDate, 'd MMM yyyy')}
                <span className="text-ink-subtle"> · {r.days} day{r.days === 1 ? '' : 's'}</span>
                {r.leaveType ? <span className="text-ink-subtle"> · {r.leaveType}</span> : null}
              </p>
              <p className="text-sm text-ink mt-1.5 max-w-2xl">{r.reason}</p>
              {r.decisionNote ? (
                <p className="text-xs text-ink-muted mt-1.5 flex items-start gap-1.5">
                  <MessageSquare className="size-3.5 mt-0.5 shrink-0" aria-hidden />
                  {r.decisionNote}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col items-end gap-2 shrink-0">
              <StatusBadge status={r.status} />
              <span className="text-xs text-ink-subtle">
                applied {format(r.createdAt, 'd MMM')}
              </span>
            </div>
          </div>

          {r.canDecide ? (
            <div className="mt-3">
              {noteFor === r.id ? (
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Optional note for the applicant"
                  className="mb-2 max-w-xl"
                  rows={2}
                />
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  loading={pendingId === r.id}
                  onClick={() => decide(r.id, 'APPROVED')}
                >
                  <Check aria-hidden />
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  loading={pendingId === r.id}
                  onClick={() => decide(r.id, 'REJECTED')}
                >
                  <X aria-hidden />
                  Reject
                </Button>
                {noteFor !== r.id ? (
                  <Button size="sm" variant="ghost" onClick={() => setNoteFor(r.id)}>
                    Add a note
                  </Button>
                ) : null}
              </div>
              <p className="text-xs text-ink-subtle mt-2">
                Approving marks these days as leave in the attendance register.
              </p>
            </div>
          ) : r.status === 'PENDING' ? (
            <div className="mt-3">
              <Button
                size="sm"
                variant="secondary"
                loading={pendingId === r.id}
                onClick={() => withdraw(r.id)}
              >
                Withdraw request
              </Button>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  )
}
