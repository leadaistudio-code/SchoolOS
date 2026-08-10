import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Table primitives.
 *
 * Rows are compact (36–40px) because an administrator reading a roll wants
 * more rows per screen, not more air. Wide tables scroll inside their own
 * container so the page body never scrolls sideways on a phone.
 */
export function TableWrap({
  className,
  sticky,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { sticky?: boolean }) {
  return (
    <div
      className={cn(
        'w-full overflow-x-auto scroll-thin',
        sticky && 'max-h-[70vh] overflow-y-auto',
        className,
      )}
      {...props}
    />
  )
}

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cn('w-full border-collapse', className)} {...props} />
}

export function THead({
  className,
  sticky,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement> & { sticky?: boolean }) {
  return (
    <thead
      className={cn('bg-surface-2', sticky && 'sticky top-0 z-10', className)}
      {...props}
    />
  )
}

export function TH({
  className,
  align = 'left',
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & { align?: 'left' | 'right' | 'center' }) {
  return (
    <th
      scope="col"
      className={cn(
        'px-3 h-9 text-xs font-semibold text-ink-muted border-b border-line whitespace-nowrap',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        align === 'left' && 'text-left',
        className,
      )}
      {...props}
    />
  )
}

export function TBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('divide-y divide-[var(--border)]', className)} {...props} />
}

export function TR({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('hover:bg-surface-2 transition-colors', className)} {...props} />
}

export function TD({
  className,
  align = 'left',
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & { align?: 'left' | 'right' | 'center' }) {
  return (
    <td
      className={cn(
        'px-3 py-2 text-sm text-ink-muted align-middle',
        align === 'right' && 'text-right tnum',
        align === 'center' && 'text-center',
        className,
      )}
      {...props}
    />
  )
}

/**
 * The strip above a table holding search, filters and bulk actions. Sits
 * inside the panel border so filters read as part of the table, not as a
 * separate floating control set.
 */
export function TableToolbar({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 px-3 py-2.5 border-b border-line',
        className,
      )}
      {...props}
    />
  )
}

/** Row-level link action. Kept quiet so actions never outweigh the data. */
export function RowActions({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex items-center justify-end gap-3', className)} {...props} />
  )
}
