'use client'

import * as React from 'react'
import { CheckCircle2, Lightbulb, RotateCcw, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Shared building blocks for the Robotics 101 activities. */

export function ActivityCard({
  kicker,
  title,
  done,
  children,
  className,
}: {
  kicker: string
  title: string
  done?: boolean
  children: React.ReactNode
  className?: string
}) {
  const id = React.useId()
  return (
    <section aria-labelledby={id} className={cn('rounded-[var(--radius-lg)] border border-line bg-surface p-4 sm:p-5', className)}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-subtle">{kicker}</p>
          <h3 id={id} className="mt-0.5 text-base font-semibold text-ink">
            {title}
          </h3>
        </div>
        {done ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success-bg px-2.5 py-1 text-xs font-medium text-success">
            <CheckCircle2 className="size-3.5" aria-hidden /> Done
          </span>
        ) : null}
      </div>
      {children}
    </section>
  )
}

export function Feedback({ tone, children, className }: { tone: 'right' | 'wrong' | 'info'; children: React.ReactNode; className?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'mt-3 flex gap-2 rounded-[var(--radius)] px-3 py-2.5 text-sm',
        tone === 'right' && 'bg-success-bg text-ink',
        tone === 'wrong' && 'bg-danger-bg text-ink',
        tone === 'info' && 'bg-surface-2 text-ink',
        className,
      )}
    >
      {tone === 'right' ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> : null}
      {tone === 'wrong' ? <XCircle className="mt-0.5 size-4 shrink-0 text-[var(--danger)]" aria-hidden /> : null}
      {tone === 'info' ? <Lightbulb className="mt-0.5 size-4 shrink-0 text-[var(--warning)]" aria-hidden /> : null}
      <div className="min-w-0">{children}</div>
    </div>
  )
}

export function Pill({
  children,
  active,
  tone,
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; tone?: 'right' | 'wrong' }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-500)] disabled:cursor-not-allowed',
        active ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-ink hover:bg-surface-2',
        tone === 'right' && 'border-[var(--success)]! bg-success-bg! text-ink!',
        tone === 'wrong' && 'border-[var(--danger)]! bg-danger-bg! text-ink!',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

export function RetryButton({ onClick, label = 'Try again' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted underline-offset-4 hover:text-ink hover:underline">
      <RotateCcw className="size-3.5" aria-hidden /> {label}
    </button>
  )
}

/** Deterministic shuffle, so server and client render the same order. */
export function seededShuffle<T>(items: T[], seed: string): T[] {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)
    const j = Math.abs(h) % (i + 1)
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  // Never hand back the answer order unchanged.
  if (out.length > 1 && out.every((v, i) => v === items[i])) out.push(out.shift()!)
  return out
}
