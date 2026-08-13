'use client'

import { useActionState } from 'react'
import { AlertCircle, ShieldCheck } from 'lucide-react'
import { mfaChallengeAction } from './actions'
import { emptyFormState } from '@/lib/form-state'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'

export function MfaChallengeForm({ token, next }: { token: string; next?: string }) {
  const [state, action, pending] = useActionState(mfaChallengeAction, emptyFormState)

  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="token" value={token} />
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {state.error ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-[var(--radius)] bg-danger-bg border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] px-3.5 py-2.5"
        >
          <AlertCircle className="size-4.5 text-[var(--danger)] mt-0.5 shrink-0" aria-hidden />
          <p className="text-sm text-[var(--danger)]">{state.error}</p>
        </div>
      ) : null}

      <Field label="Authenticator code" htmlFor="code" required error={state.fieldErrors.code}>
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123456"
          maxLength={6}
          required
          aria-invalid={!!state.fieldErrors.code}
        />
      </Field>

      <Button type="submit" size="lg" block loading={pending}>
        {!pending ? <ShieldCheck className="size-4" aria-hidden /> : null}
        Verify and continue
      </Button>
    </form>
  )
}
