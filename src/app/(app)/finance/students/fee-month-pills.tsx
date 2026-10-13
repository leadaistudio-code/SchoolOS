'use client'

import { CheckCircle2, Clock3, Hourglass, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export type FeeMonthStatus = 'paid' | 'pending' | 'overdue' | 'upcoming'

export type FeeMonthPill = {
  key: string
  label: string
  year: number
  monthIndex: number
  status: FeeMonthStatus
  billedMinor: number
  paidMinor: number
  balanceMinor: number
}

const STATUS_STYLE: Record<
  FeeMonthStatus,
  { pill: string; Icon: typeof CheckCircle2 }
> = {
  paid: {
    pill: 'bg-success-bg text-success border-[color-mix(in_srgb,var(--success)_28%,transparent)]',
    Icon: CheckCircle2,
  },
  pending: {
    pill: 'bg-warning-bg text-warning border-[color-mix(in_srgb,var(--warning)_28%,transparent)]',
    Icon: Hourglass,
  },
  overdue: {
    pill: 'bg-danger-bg text-[var(--danger)] border-[color-mix(in_srgb,var(--danger)_28%,transparent)]',
    Icon: XCircle,
  },
  upcoming: {
    pill: 'bg-surface-2 text-ink-muted border-line-strong',
    Icon: Clock3,
  },
}

export function FeeMonthPills({
  months,
  selectedKey,
  onSelect,
}: {
  months: FeeMonthPill[]
  selectedKey?: string | null
  onSelect?: (key: string | null) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="list" aria-label="Monthly fee status">
      {months.map((month) => {
        const { pill, Icon } = STATUS_STYLE[month.status]
        const selected = selectedKey === month.key
        return (
          <button
            key={month.key}
            type="button"
            role="listitem"
            title={`${month.label}: ${month.status}`}
            onClick={() => onSelect?.(selected ? null : month.key)}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
              pill,
              selected && 'ring-2 ring-[var(--brand-500)] ring-offset-1',
              onSelect && 'cursor-pointer hover:brightness-[0.98]',
            )}
          >
            {month.label}
            <Icon className="size-3.5" aria-hidden />
          </button>
        )
      })}
    </div>
  )
}
