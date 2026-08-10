import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Panel: a bordered working surface.
 *
 * Grouping is communicated by a hairline border and a heading, not by
 * elevation. Panels do not nest — if content inside a panel needs its own
 * grouping, use <Section>.
 */
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('bg-surface border border-line rounded-[var(--radius)]', className)}
      {...props}
    />
  )
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'px-4 py-2.5 flex items-center justify-between gap-3 border-b border-line min-h-11',
        className,
      )}
      {...props}
    />
  )
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('text-base font-semibold text-ink', className)} {...props} />
}

export function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-xs text-ink-subtle mt-0.5', className)} {...props} />
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4', className)} {...props} />
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'px-4 py-2.5 border-t border-line flex items-center gap-2 rounded-b-[var(--radius)]',
        className,
      )}
      {...props}
    />
  )
}

/**
 * A titled block inside a page or panel. Used instead of wrapping every
 * subsection in its own card: a heading plus a rule reads as a group without
 * adding another box.
 */
export function Section({
  title,
  description,
  actions,
  className,
  children,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <section className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-2">
        <div>
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          {description ? <p className="text-xs text-ink-subtle mt-0.5">{description}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  )
}

/**
 * Label/value list for record detail pages. Two columns on anything wider
 * than a phone, so a profile reads as a form rather than a paragraph.
 */
export function DescriptionList({
  className,
  ...props
}: React.HTMLAttributes<HTMLDListElement>) {
  return <dl className={cn('divide-y divide-[var(--border)]', className)} {...props} />
}

export function DescriptionItem({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-3 py-2">
      <dt className="text-sm text-ink-subtle">{label}</dt>
      <dd className="text-sm text-ink min-w-0">{children}</dd>
    </div>
  )
}
