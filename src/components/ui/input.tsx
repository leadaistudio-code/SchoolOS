'use client'

import * as React from 'react'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'

const base =
  'w-full bg-surface border border-line-strong rounded-[var(--radius-sm)] px-2.5 text-base text-ink placeholder:text-ink-subtle transition-colors focus:border-[var(--brand-500)] disabled:opacity-60 disabled:bg-surface-2 aria-[invalid=true]:border-[var(--danger)]'

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(base, 'h-9', className)} {...props} />
  ),
)
Input.displayName = 'Input'

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(base, 'py-2 min-h-20 resize-y', className)} {...props} />
))
Textarea.displayName = 'Textarea'

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(base, 'h-9 pr-7 appearance-none bg-no-repeat', className)}
    style={{
      backgroundImage:
        "url(\"data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%23757f8d' stroke-width='1.5'%3E%3Cpath d='m4 6 4 4 4-4'/%3E%3C/svg%3E\")",
      backgroundPosition: 'right 8px center',
    }}
    {...props}
  />
))
Select.displayName = 'Select'

/** Search field with its affordance built in, so no page draws its own. */
export const SearchInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <div className="relative flex-1 min-w-48">
    <Search
      className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-ink-subtle pointer-events-none"
      aria-hidden
    />
    <Input ref={ref} type="search" className={cn('pl-8', className)} {...props} />
  </div>
))
SearchInput.displayName = 'SearchInput'

export const Checkbox = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    type="checkbox"
    className={cn(
      'size-4 rounded-[3px] border border-line-strong bg-surface accent-[var(--brand-500)] cursor-pointer disabled:cursor-default disabled:opacity-50',
      className,
    )}
    {...props}
  />
))
Checkbox.displayName = 'Checkbox'

/**
 * Labelled control.
 *
 * The label is always rendered — placeholder-only fields fail the moment a
 * value is entered and the user forgets what it was for.
 */
export function Field({
  label,
  hint,
  error,
  required,
  htmlFor,
  children,
  className,
}: {
  label: string
  hint?: string
  error?: string
  required?: boolean
  htmlFor?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('space-y-1', className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
        {label}
        {required ? (
          <span className="text-[var(--danger)] ml-0.5" aria-hidden>
            *
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

/**
 * A named group of fields inside a long form. Sections carry the structure so
 * the form does not need a card per topic.
 */
export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: string
  description?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn('grid gap-4 lg:grid-cols-[13rem_minmax(0,1fr)]', className)}>
      <div className="lg:pt-0.5">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {description ? <p className="text-xs text-ink-subtle mt-0.5">{description}</p> : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 max-w-3xl">{children}</div>
    </section>
  )
}

/**
 * Save/cancel row. Always the same order and the same place, so muscle memory
 * carries between screens.
 */
export function FormActions({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 border-t border-line pt-4 sticky bottom-0 bg-bg py-3 -mb-3',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}
