'use client'

import * as React from 'react'
import { useActionState } from 'react'
import Link from 'next/link'
import { AlertCircle, ShieldCheck } from 'lucide-react'
import { verifyOtpAction } from '../actions'
import { emptyFormState } from '@/lib/form-state'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'

/**
 * Entering the six digits.
 *
 * The field is a plain numeric input rather than six separate boxes: split
 * boxes look neat and behave badly on the cheap Android keyboards most parents
 * use, where autofill pastes the whole code into the first one.
 */
export function VerifyOtpForm({ challenge }: { challenge: string }) {
  const [state, formAction, pending] = useActionState(verifyOtpAction, emptyFormState)

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="challenge" value={challenge} />

      {state.error ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-[var(--radius)] bg-danger-bg border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] px-3.5 py-2.5"
        >
          <AlertCircle className="size-4.5 text-[var(--danger)] mt-0.5 shrink-0" aria-hidden />
          <p className="text-sm text-[var(--danger)]">{state.error}</p>
        </div>
      ) : null}

      <Field label="6-digit code" htmlFor="code" required error={state.fieldErrors.code}>
        <Input
          id="code"
          name="code"
          type="text"
          inputMode="numeric"
          // Lets Android and iOS offer the code straight from the notification.
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          autoFocus
          placeholder="123456"
          required
          className="text-center text-2xl tracking-[0.4em] font-semibold h-12"
          aria-invalid={!!state.fieldErrors.code}
        />
      </Field>

      <Button type="submit" size="lg" block loading={pending}>
        {!pending ? <ShieldCheck className="size-4" aria-hidden /> : null}
        Verify and choose a password
      </Button>

      <p className="text-xs text-ink-subtle leading-relaxed">
        Codes expire after 10 minutes and stop working after five wrong tries.
      </p>

      <Link
        href="/forgot-password"
        className="inline-flex text-xs font-semibold text-[var(--brand-500)] hover:underline"
      >
        Use a different number
      </Link>
    </form>
  )
}
