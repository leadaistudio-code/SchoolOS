import * as React from 'react'
import { AlertTriangle, Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Empty state. Always says what the thing is and how to create the first one. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center px-6 py-14', className)}>
      <div className="size-11 rounded-full bg-surface-2 border border-line grid place-items-center text-ink-subtle mb-3">
        {icon ?? <Inbox className="size-5" aria-hidden />}
      </div>
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      {description ? (
        <p className="text-[13px] text-ink-muted mt-1 max-w-sm">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

export function ErrorState({
  title = 'Something went wrong',
  description,
  action,
}: {
  title?: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-14">
      <div className="size-11 rounded-full bg-danger-bg grid place-items-center text-[var(--danger)] mb-3">
        <AlertTriangle className="size-5" aria-hidden />
      </div>
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      {description ? <p className="text-[13px] text-ink-muted mt-1 max-w-sm">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-md', className)} aria-hidden />
}

export function TableSkeleton({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="p-4 space-y-3" aria-label="Loading" role="status">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={cn('h-5 flex-1', c === 0 && 'max-w-[220px]')} />
          ))}
        </div>
      ))}
    </div>
  )
}
