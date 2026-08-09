'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

const base =
  'w-full bg-surface border border-line-strong rounded-[var(--radius-sm)] px-3 text-[13.5px] text-ink placeholder:text-ink-subtle transition-colors focus:border-[var(--brand-500)] disabled:opacity-60 disabled:bg-surface-2 aria-[invalid=true]:border-[var(--danger)]'

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(base, 'h-9.5', className)} {...props} />
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
  <select ref={ref} className={cn(base, 'h-9.5 pr-8 appearance-none bg-no-repeat', className)}
    style={{
      backgroundImage:
        "url(\"data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%23667085' stroke-width='1.5'%3E%3Cpath d='m4 6 4 4 4-4'/%3E%3C/svg%3E\")",
      backgroundPosition: 'right 10px center',
    }}
    {...props}
  />
))
Select.displayName = 'Select'

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
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="block text-[12.5px] font-semibold text-ink">
        {label}
        {required ? <span className="text-[var(--danger)] ml-0.5">*</span> : null}
      </label>
      {children}
      {error ? (
        <p className="text-[12px] text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[12px] text-ink-subtle">{hint}</p>
      ) : null}
    </div>
  )
}
