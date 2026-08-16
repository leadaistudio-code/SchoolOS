'use client'

import * as React from 'react'
import { useActionState } from 'react'
import Link from 'next/link'
import { AlertCircle, KeyRound } from 'lucide-react'
import { emptyFormState, type FormState } from '@/lib/form-state'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'

type Props = {
  action: (prev: FormState, formData: FormData) => Promise<FormState>
  token: string
  submitLabel: string
  minLength: number
}

/**
 * Shared by the reset and invite links: both end in the same act of choosing a
 * password, and a parent who follows one should not meet a different form than
 * a parent who follows the other.
 */
export function SetPasswordForm({ action, token, submitLabel, minLength }: Props) {
  const [state, formAction, pending] = useActionState(action, emptyFormState)

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="token" value={token} />

      {state.error ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-[var(--radius)] bg-danger-bg border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] px-3.5 py-2.5"
        >
          <AlertCircle className="size-4.5 text-[var(--danger)] mt-0.5 shrink-0" aria-hidden />
          <div className="space-y-1.5">
            <p className="text-sm text-[var(--danger)]">{state.error}</p>
            <Link
              href="/forgot-password"
              className="inline-flex text-xs font-semibold text-[var(--brand-600)] hover:underline"
            >
              Request a new link
            </Link>
          </div>
        </div>
      ) : null}

      <Field
        label="New password"
        htmlFor="password"
        required
        error={state.fieldErrors.password}
        hint={`At least ${minLength} characters, with a capital, a small letter and a number.`}
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          autoFocus
          required
          minLength={minLength}
          aria-invalid={!!state.fieldErrors.password}
        />
      </Field>

      <Field
        label="Confirm new password"
        htmlFor="confirmPassword"
        required
        error={state.fieldErrors.confirmPassword}
      >
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={!!state.fieldErrors.confirmPassword}
        />
      </Field>

      <Button type="submit" size="lg" block loading={pending}>
        {!pending ? <KeyRound className="size-4" aria-hidden /> : null}
        {submitLabel}
      </Button>
    </form>
  )
}
