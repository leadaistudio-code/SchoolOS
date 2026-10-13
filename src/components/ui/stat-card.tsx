import * as React from 'react'
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

const PALETTE = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316']

export const ACCENT = {
  indigo: '#6366f1',
  sky: '#0ea5e9',
  emerald: '#10b981',
  amber: '#f59e0b',
  pink: '#ec4899',
  violet: '#8b5cf6',
  teal: '#14b8a6',
  orange: '#f97316',
  rose: '#f43f5e',
  slate: '#64748b',
} as const

/** Stable colour for a label, so the same card is always the same colour. */
export function accentFor(label: string) {
  let h = 0
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]!
}

const tint = (pct: number) => `color-mix(in srgb, var(--accent) ${pct}%, transparent)`

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  accent,
  tone,
  href,
  className,
}: {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  icon?: LucideIcon
  /** CSS colour; defaults to a colour derived from the label. */
  accent?: string
  /** Colours the figure itself. */
  tone?: 'success' | 'danger' | 'warning'
  href?: string
  className?: string
}) {
  const style = { '--accent': accent ?? accentFor(label) } as React.CSSProperties
  const body = (
    <div
      style={{ ...style, background: `linear-gradient(135deg, ${tint(9)} 0%, transparent 55%), var(--surface)` }}
      className={cn(
        'relative h-full overflow-hidden rounded-xl border border-line p-4 pl-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-shadow',
        href && 'hover:shadow-md',
        className,
      )}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: 'var(--accent)' }} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--accent)' }}>
            {label}
          </p>
          <p
            className={cn(
              'mt-1.5 truncate text-xl font-semibold tnum',
              tone === 'success' && 'text-success',
              tone === 'danger' && 'text-[var(--danger)]',
              tone === 'warning' && 'text-warning',
              !tone && 'text-ink',
            )}
          >
            {value}
          </p>
          {hint ? <p className="mt-0.5 text-xs text-ink-subtle">{hint}</p> : null}
        </div>
        {Icon ? (
          <span
            aria-hidden
            className="grid size-9 shrink-0 place-items-center rounded-lg"
            style={{ background: tint(14), color: 'var(--accent)' }}
          >
            <Icon className="size-[18px]" strokeWidth={2.25} />
          </span>
        ) : null}
      </div>
    </div>
  )
  return href ? (
    <Link href={href} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  )
}

/** ActionButton's look for navigation. */
export function ActionLink({
  href,
  children,
  icon: Icon,
  accent,
  className,
}: {
  href: string
  children: React.ReactNode
  icon?: LucideIcon
  accent?: string
  className?: string
}) {
  const style = { '--accent': accent ?? ACCENT.indigo } as React.CSSProperties
  return (
    <Link
      href={href}
      style={{ ...style, background: tint(9), borderColor: tint(28) }}
      className={cn(
        'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium text-ink transition-all',
        'hover:-translate-y-px hover:shadow-sm active:translate-y-0',
        className,
      )}
    >
      {Icon ? (
        <span aria-hidden className="grid size-6 place-items-center rounded-md text-white" style={{ background: 'var(--accent)' }}>
          <Icon className="size-3.5" strokeWidth={2.25} />
        </span>
      ) : null}
      {children}
    </Link>
  )
}

/** A colourful toolbar button; use inside a <form> for server actions. */
export function ActionButton({
  children,
  icon: Icon,
  accent,
  type = 'submit',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: LucideIcon; accent?: string }) {
  const style = { '--accent': accent ?? ACCENT.indigo } as React.CSSProperties
  return (
    <button
      type={type}
      style={{ ...style, background: tint(9), borderColor: tint(28) }}
      className={cn(
        'group inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium text-ink transition-all',
        'hover:-translate-y-px hover:shadow-sm active:translate-y-0 disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {Icon ? (
        <span
          aria-hidden
          className="grid size-6 place-items-center rounded-md text-white"
          style={{ background: 'var(--accent)' }}
        >
          <Icon className="size-3.5" strokeWidth={2.25} />
        </span>
      ) : null}
      {children}
    </button>
  )
}
