'use client'

import * as React from 'react'
import { useActionState } from 'react'
import Link from 'next/link'
import { AlertCircle, CheckCircle2, KeyRound } from 'lucide-react'
import { forgotPasswordAction } from './actions'
import { emptyFormState } from '@/lib/form-state'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(forgotPasswordAction, emptyFormState)

  if (state.ok) {
    return (
      <div className="space-y-4">
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-[var(--radius)] bg-success-bg border border-[color-mix(in_srgb,var(--success)_30%,transparent)] px-3.5 py-2.5"
        >
          <CheckCircle2 className="size-4.5 text-[var(--success)] mt-0.5 shrink-0" aria-hidden />
          <p className="text-sm text-ink">{state.message}</p>
        </div>
        <Link
          href="/login"
          className="inline-flex text-sm font-semibold text-[var(--brand-500)] hover:underline"
        >
          Back to sign in
        </Link>
      </div>
    )
  }

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.error ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-[var(--radius)] bg-danger-bg border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] px-3.5 py-2.5"
        >
          <AlertCircle className="size-4.5 text-[var(--danger)] mt-0.5 shrink-0" aria-hidden />
          <p className="text-sm text-[var(--danger)]">{state.error}</p>
        </div>
      ) : null}

      <Field label="Email address" htmlFor="email" required error={state.fieldErrors.email}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="you@school.edu"
          required
          aria-invalid={!!state.fieldErrors.email}
        />
      </Field>

      <Field
        label="Anything we should know? (optional)"
        htmlFor="note"
        error={state.fieldErrors.note}
        hint="For example, your name or role at the school."
      >
        <textarea
          id="note"
          name="note"
          rows={3}
          maxLength={500}
          className="w-full rounded-[var(--radius-sm)] border border-line bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-[var(--brand-500)]"
          placeholder="I am the school administrator…"
        />
      </Field>

      <Button type="submit" size="lg" block loading={pending}>
        {!pending ? <KeyRound className="size-4" aria-hidden /> : null}
        Request password reset
      </Button>

      <p className="text-xs text-ink-subtle leading-relaxed">
        This opens a support ticket for the platform team. They will verify your identity and reset
        your password — we never send reset links by email from this page.
      </p>

      <Link
        href="/login"
        className="inline-flex text-xs font-semibold text-[var(--brand-500)] hover:underline"
      >
        Back to sign in
      </Link>
    </form>
  )
}
