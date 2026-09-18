'use client'

import * as React from 'react'
import { format } from 'date-fns'
import { CheckCheck } from 'lucide-react'
import { bulkReturnLoansAction } from '../actions'
import { BulkSelectionBar, useBulkSelection } from '@/components/bulk-selection'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'
import { ReturnButton } from '../forms'

type LoanRow = {
  id: string
  title: string
  dueOn: string
  studentName: string | null
  isOverdue: boolean
}

export function LoanList({
  rows,
  canReturn,
}: {
  rows: LoanRow[]
  canReturn: boolean
}) {
  const toast = useToast()
  const [pending, startTransition] = React.useTransition()
  const selection = useBulkSelection(rows.map((row) => row.id))

  const returnSelected = () => {
    if (!window.confirm(`Return ${selection.selected.size} selected loan(s)?`)) return
    startTransition(async () => {
      const result = await bulkReturnLoansAction(selection.selectedIds)
      toast.push({
        tone: result.ok ? 'success' : 'error',
        title: result.ok ? 'Loans returned' : 'Some loans were not returned',
        description: result.message,
      })
      if (result.ok) selection.clear()
    })
  }

  if (rows.length === 0) {
    return <EmptyState title="No open loans" description="Issue a book from the side form." />
  }

  return (
    <>
      {canReturn ? (
        <BulkSelectionBar count={selection.selected.size} noun="loan" onClear={selection.clear}>
          <Button size="sm" loading={pending} onClick={returnSelected}>
            <CheckCheck aria-hidden />
            Return selected
          </Button>
        </BulkSelectionBar>
      ) : null}
      {canReturn ? (
        <label className="flex items-center gap-2 border-b border-line px-3 py-2 text-xs text-ink-muted">
          <Checkbox
            aria-label="Select all open loans"
            checked={selection.allSelected}
            onChange={selection.toggleAll}
          />
          Select all open loans
        </label>
      ) : null}
      <div className="space-y-3 p-3">
        {rows.map((loan) => (
          <div
            key={loan.id}
            className="flex flex-wrap items-start gap-3 rounded-[var(--radius-sm)] border border-line p-3"
          >
            {canReturn ? (
              <Checkbox
                aria-label={`Select ${loan.title}`}
                checked={selection.selected.has(loan.id)}
                onChange={() => selection.toggle(loan.id)}
              />
            ) : null}
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-ink">{loan.title}</p>
                <Badge tone={loan.isOverdue ? 'danger' : 'neutral'}>
                  {loan.isOverdue ? 'Overdue' : 'Issued'}
                </Badge>
              </div>
              <p className="text-xs text-ink-subtle">
                Due {format(new Date(loan.dueOn), 'd MMM yyyy')}
                {loan.studentName ? ` · ${loan.studentName}` : ''}
              </p>
            </div>
            {canReturn ? <ReturnButton id={loan.id} /> : null}
          </div>
        ))}
      </div>
    </>
  )
}
