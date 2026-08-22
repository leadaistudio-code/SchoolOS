'use client'

import * as React from 'react'
import { Info } from 'lucide-react'
import { Input, Select } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { formatInr } from '@/lib/roi/format'

/**
 * The input vocabulary of the calculator.
 *
 * Three rules, and they are the difference between a form a school owner
 * trusts and one they close:
 *
 *  1. A number that came from the school's own records says so. A figure the
 *     calculator guessed says that too. The two are never dressed the same.
 *  2. Every assumption is on the surface. Nothing that moves the total lives
 *     behind a tooltip alone.
 *  3. Currency inputs echo their own formatted value, so a mistyped zero is
 *     visible before it reaches the result rather than after.
 */

export function FieldRow({
  label,
  hint,
  seeded,
  error,
  htmlFor,
  children,
  className,
}: {
  label: string
  hint?: React.ReactNode
  /** Marks a value read from the school's live records. */
  seeded?: boolean
  error?: string
  htmlFor?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('space-y-1', className)}>
      <label htmlFor={htmlFor} className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-ink">
        {label}
        {seeded ? (
          <span className="rounded-[4px] border border-[var(--brand-100)] bg-[var(--brand-50)] px-1.5 py-px text-[10px] font-medium text-[var(--brand-600)]">
            from your records
          </span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-ink-subtle">{hint}</p>
      ) : null}
    </div>
  )
}

export function NumberField({
  id,
  label,
  value,
  onChange,
  hint,
  seeded,
  error,
  min = 0,
  max,
  step = 1,
  suffix,
  className,
}: {
  id: string
  label: string
  value: number
  onChange: (value: number) => void
  hint?: React.ReactNode
  seeded?: boolean
  error?: string
  min?: number
  max?: number
  step?: number
  suffix?: string
  className?: string
}) {
  return (
    <FieldRow label={label} hint={hint} seeded={seeded} error={error} htmlFor={id} className={className}>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={step}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
          aria-invalid={error ? true : undefined}
        />
        {suffix ? <span className="shrink-0 text-xs text-ink-subtle">{suffix}</span> : null}
      </div>
    </FieldRow>
  )
}

/**
 * Money, echoed back in words the reader recognises.
 *
 * The grouped echo underneath is not decoration: ₹3,20,000 and ₹32,000 are one
 * keystroke apart and look almost identical in a bare input, and that mistake
 * silently multiplies every downstream figure by ten.
 */
export function MoneyField({
  id,
  label,
  value,
  onChange,
  hint,
  seeded,
  error,
  max,
  className,
}: {
  id: string
  label: string
  value: number
  onChange: (value: number) => void
  hint?: React.ReactNode
  seeded?: boolean
  error?: string
  max?: number
  className?: string
}) {
  return (
    <FieldRow
      label={label}
      seeded={seeded}
      error={error}
      htmlFor={id}
      className={className}
      hint={
        <>
          {value > 0 ? <span className="font-medium text-ink-muted">{formatInr(value)}</span> : null}
          {value > 0 && hint ? ' · ' : null}
          {hint}
        </>
      }
    >
      <div className="relative">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-ink-subtle">
          ₹
        </span>
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          max={max}
          step={100}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
          className="pl-6"
          aria-invalid={error ? true : undefined}
        />
      </div>
    </FieldRow>
  )
}

export function SelectField<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
  hint,
  seeded,
  className,
}: {
  id: string
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  hint?: React.ReactNode
  seeded?: boolean
  className?: string
}) {
  return (
    <FieldRow label={label} hint={hint} seeded={seeded} htmlFor={id} className={className}>
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </FieldRow>
  )
}

/**
 * A percentage the school can move.
 *
 * Used only where the value is genuinely a judgement — how much of the current
 * tool spend really goes away — rather than a measurement. A slider on a
 * measurement would invite people to nudge facts.
 */
export function ShareSlider({
  id,
  label,
  value,
  onChange,
  hint,
  className,
}: {
  id: string
  label: string
  /** 0–1. */
  value: number
  onChange: (value: number) => void
  hint?: React.ReactNode
  className?: string
}) {
  const percent = Math.round(value * 100)
  return (
    <FieldRow label={label} hint={hint} htmlFor={id} className={className}>
      <div className="flex items-center gap-3">
        <input
          id={id}
          type="range"
          min={0}
          max={100}
          step={5}
          value={percent}
          onChange={(e) => onChange(Number(e.target.value) / 100)}
          className="flex-1 accent-[var(--brand-500)]"
        />
        <span className="w-12 shrink-0 text-right text-sm font-medium tnum text-ink">{percent}%</span>
      </div>
    </FieldRow>
  )
}

/** An explanatory aside that is always visible, never hover-only. */
export function Aside({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex gap-2 rounded-[var(--radius-sm)] bg-surface-2 px-3 py-2 text-xs text-ink-muted">
      <Info className="mt-px size-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  )
}
