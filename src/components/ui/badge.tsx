import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * Status chip.
 *
 * Reserved for categorical state that a reader scans for — paid, overdue,
 * absent, pending. Ordinary values stay as text: a table where everything is
 * a chip communicates nothing.
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-[4px] border px-1.5 py-px text-xs font-medium leading-4 whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'bg-surface-2 text-ink-muted border-line-strong',
        brand: 'bg-[var(--brand-50)] text-[var(--brand-600)] border-[var(--brand-100)]',
        success:
          'bg-success-bg text-success border-[color-mix(in_srgb,var(--success)_28%,transparent)]',
        warning:
          'bg-warning-bg text-warning border-[color-mix(in_srgb,var(--warning)_28%,transparent)]',
        danger:
          'bg-danger-bg text-[var(--danger)] border-[color-mix(in_srgb,var(--danger)_28%,transparent)]',
        info: 'bg-info-bg text-info border-[color-mix(in_srgb,var(--info)_28%,transparent)]',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
)

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>['tone']>

export function Badge({
  className,
  tone,
  dot,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants> & { dot?: boolean }) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {dot ? <span className="size-1.5 rounded-full bg-current" aria-hidden /> : null}
      {children}
    </span>
  )
}

/**
 * Domain status chips.
 *
 * The mapping from a database enum to a colour lives here once, so the same
 * status never renders amber on one screen and grey on another.
 */
const STATUS_TONE: Record<string, BadgeTone> = {
  // Students and staff
  ACTIVE: 'success',
  INACTIVE: 'neutral',
  ALUMNI: 'neutral',
  TRANSFERRED: 'neutral',
  WITHDRAWN: 'neutral',
  SUSPENDED: 'danger',
  // Attendance
  PRESENT: 'success',
  ABSENT: 'danger',
  LATE: 'warning',
  HALF_DAY: 'warning',
  EXCUSED: 'info',
  ON_LEAVE: 'info',
  // Invoices and payments
  PAID: 'success',
  PARTIAL: 'warning',
  PARTIALLY_PAID: 'warning',
  UNPAID: 'neutral',
  ISSUED: 'neutral',
  OVERDUE: 'danger',
  CANCELLED: 'neutral',
  REFUNDED: 'neutral',
  SUCCESS: 'success',
  FAILED: 'danger',
  // Workflow
  DRAFT: 'neutral',
  SCHEDULED: 'info',
  PUBLISHED: 'success',
  IN_PROGRESS: 'info',
  ONGOING: 'info',
  COMPLETED: 'success',
  CLOSED: 'neutral',
  ARCHIVED: 'neutral',
  PENDING: 'warning',
  SUBMITTED: 'info',
  APPROVED: 'success',
  REJECTED: 'danger',
  GRADED: 'success',
  LATE_SUBMISSION: 'warning',
}

/** Turns SCREAMING_SNAKE enums into readable text without shouting. */
export function humanizeStatus(status: string): string {
  const s = status.replaceAll('_', ' ').toLowerCase()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function StatusBadge({
  status,
  label,
  tone,
  className,
}: {
  status: string
  /** Override the derived text. */
  label?: string
  /** Override the derived tone for a status this map does not know. */
  tone?: BadgeTone
  className?: string
}) {
  return (
    <Badge tone={tone ?? STATUS_TONE[status] ?? 'neutral'} className={className}>
      {label ?? humanizeStatus(status)}
    </Badge>
  )
}
