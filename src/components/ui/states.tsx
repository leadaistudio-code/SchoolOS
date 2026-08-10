import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Empty state.
 *
 * States what is missing and what to do about it, in that order. No
 * illustration, no icon medallion — an empty table is a normal condition, not
 * an event.
 */
export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('px-4 py-12 text-center', className)}>
      <p className="text-base font-medium text-ink">{title}</p>
      {description ? (
        <p className="text-sm text-ink-muted mt-1 max-w-md mx-auto">{description}</p>
      ) : null}
      {action ? <div className="mt-3 flex justify-center">{action}</div> : null}
    </div>
  )
}

export function ErrorState({
  title = 'This did not load',
  description,
  action,
}: {
  title?: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="px-4 py-12 text-center" role="alert">
      <p className="text-base font-medium text-ink">{title}</p>
      {description ? (
        <p className="text-sm text-ink-muted mt-1 max-w-md mx-auto">{description}</p>
      ) : null}
      {action ? <div className="mt-3 flex justify-center">{action}</div> : null}
    </div>
  )
}

/** Inline notice used for warnings and context that belongs to a record. */
export function Notice({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: 'info' | 'warning' | 'danger' | 'success'
  title?: string
  children?: React.ReactNode
  className?: string
}) {
  const tones = {
    info: 'bg-info-bg text-info border-[color-mix(in_srgb,var(--info)_25%,transparent)]',
    warning:
      'bg-warning-bg text-warning border-[color-mix(in_srgb,var(--warning)_25%,transparent)]',
    danger: 'bg-danger-bg text-[var(--danger)] border-[color-mix(in_srgb,var(--danger)_25%,transparent)]',
    success:
      'bg-success-bg text-success border-[color-mix(in_srgb,var(--success)_25%,transparent)]',
  } as const

  return (
    <div className={cn('rounded-[var(--radius-sm)] border px-3 py-2 text-sm', tones[tone], className)}>
      {title ? <p className="font-semibold">{title}</p> : null}
      {children}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-[var(--radius-sm)]', className)} aria-hidden />
}

export function TableSkeleton({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="px-3 py-2 divide-y divide-[var(--border)]" aria-label="Loading" role="status">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3 py-2">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={cn('h-4 flex-1', c === 0 && 'max-w-56')} />
          ))}
        </div>
      ))}
    </div>
  )
}
