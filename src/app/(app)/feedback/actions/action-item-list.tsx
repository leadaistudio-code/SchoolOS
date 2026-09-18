'use client'

import * as React from 'react'
import { Clock3, Play, ShieldAlert } from 'lucide-react'
import { BulkSelectionBar, useBulkSelection } from '@/components/bulk-selection'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox, Select } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { formatDay } from '@/lib/dates'
import { bulkUpdateActionItemsAction } from '../workflow-actions'
import { ActionControls, type StaffOption } from './controls'

type ActionItemRow = {
  id: string
  status: string
  priority: string
  category: string | null
  dueAt: string | null
  overdue: boolean
  title: string
  description: string | null
  assigneeStaffId: string | null
  assigneeName: string | null
}

const STATUS_TONE: Record<string, BadgeTone> = {
  OPEN: 'warning',
  ASSIGNED: 'info',
  IN_PROGRESS: 'info',
  WAITING: 'neutral',
}

const PRIORITY_TONE: Record<string, BadgeTone> = {
  LOW: 'neutral',
  MEDIUM: 'info',
  HIGH: 'warning',
  URGENT: 'danger',
}

export function ActionItemList({
  rows,
  staff,
}: {
  rows: ActionItemRow[]
  staff: StaffOption[]
}) {
  const toast = useToast()
  const [pending, startTransition] = React.useTransition()
  const [priority, setPriority] = React.useState<'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'>('MEDIUM')
  const selection = useBulkSelection(rows.map((row) => row.id))

  const update = (change: {
    status?: 'IN_PROGRESS' | 'WAITING'
    priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
  }) =>
    startTransition(async () => {
      const result = await bulkUpdateActionItemsAction({
        ids: selection.selectedIds,
        ...change,
      })
      toast.push({
        tone: result.ok ? 'success' : 'error',
        title: result.ok ? 'Action items updated' : 'Some items were not updated',
        description: result.message,
      })
      if (result.ok) selection.clear()
    })

  return (
    <>
      <BulkSelectionBar count={selection.selected.size} noun="action item" onClear={selection.clear}>
        <Button size="sm" variant="secondary" loading={pending} onClick={() => update({ status: 'IN_PROGRESS' })}>
          <Play aria-hidden />
          Start progress
        </Button>
        <Button size="sm" variant="secondary" loading={pending} onClick={() => update({ status: 'WAITING' })}>
          <Clock3 aria-hidden />
          Mark waiting
        </Button>
        <Select
          aria-label="Bulk priority"
          className="h-8 w-28 text-xs"
          value={priority}
          onChange={(event) => setPriority(event.target.value as typeof priority)}
        >
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
          <option value="URGENT">Urgent</option>
        </Select>
        <Button size="sm" variant="secondary" loading={pending} onClick={() => update({ priority })}>
          <ShieldAlert aria-hidden />
          Apply priority
        </Button>
      </BulkSelectionBar>
      <label className="flex items-center gap-2 border-b border-line px-4 py-2 text-xs text-ink-muted">
        <Checkbox
          aria-label="Select all open action items"
          checked={selection.allSelected}
          onChange={selection.toggleAll}
        />
        Select all open action items
      </label>
      <ul className="divide-y divide-[var(--border)]">
        {rows.map((item) => (
          <li key={item.id} className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Checkbox
                aria-label={`Select ${item.title}`}
                checked={selection.selected.has(item.id)}
                onChange={() => selection.toggle(item.id)}
              />
              <Badge tone={PRIORITY_TONE[item.priority] ?? 'neutral'}>
                {item.priority.toLowerCase()}
              </Badge>
              <Badge tone={STATUS_TONE[item.status] ?? 'neutral'}>
                {item.status.toLowerCase().replace(/_/g, ' ')}
              </Badge>
              {item.category ? <span className="text-xs text-ink-subtle">{item.category}</span> : null}
              {item.dueAt ? (
                <span
                  className={
                    item.overdue
                      ? 'ml-auto text-xs tnum font-medium text-[var(--danger)]'
                      : 'ml-auto text-xs tnum text-ink-subtle'
                  }
                >
                  Due {formatDay(new Date(item.dueAt))}
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-base font-medium text-ink">{item.title}</p>
            {item.description ? (
              <p className="mt-1 whitespace-pre-wrap text-sm text-ink-muted">{item.description}</p>
            ) : null}
            <p className="mt-1 text-xs text-ink-subtle">
              {item.assigneeName ? `Assigned to ${item.assigneeName}` : 'Nobody assigned'}
            </p>
            <ActionControls
              id={item.id}
              status={item.status}
              priority={item.priority}
              assigneeStaffId={item.assigneeStaffId ?? ''}
              staff={staff}
            />
          </li>
        ))}
      </ul>
    </>
  )
}
