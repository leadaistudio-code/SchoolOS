import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * Soft-tinted chip with a coloured underline — the reference's signature
 * badge. The underline carries the status colour at full strength while the
 * fill stays pale, so a table full of badges never turns into a colour riot.
 */
const badgeVariants = cva(
  'badge-soft inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-0.5 text-[11.5px] font-medium leading-5 capitalize',
  {
    variants: {
      tone: {
        neutral: 'bg-surface-2 text-ink-muted border-b-[var(--border-strong)]',
        brand: 'bg-[var(--brand-50)] text-[var(--brand-500)] border-b-[var(--brand-500)]',
        success: 'bg-success-bg text-success border-b-[var(--success)]',
        warning: 'bg-warning-bg text-warning border-b-[var(--warning)]',
        danger: 'bg-danger-bg text-[var(--danger)] border-b-[var(--danger)]',
        info: 'bg-info-bg text-info border-b-[var(--info)]',
        purple: 'bg-purple-bg text-purple border-b-[var(--purple)]',
        teal: 'bg-teal-bg text-teal border-b-[var(--teal)]',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
)

export function Badge({
  className,
  tone,
  dot,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants> & { dot?: boolean }) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {dot ? <span className="size-1.5 rounded-full bg-current" aria-hidden /> : null}
      {props.children}
    </span>
  )
}
