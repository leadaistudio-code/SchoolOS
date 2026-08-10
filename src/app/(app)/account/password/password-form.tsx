'use client'

import { useActionState } from 'react'
import { AlertCircle } from 'lucide-react'
import { changePasswordAction } from './actions'
import { emptyFormState } from '@/lib/form-state'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Field, Input } from '@/components/ui/input'

export function PasswordForm({ minLength, forced }: { minLength: number; forced: boolean }) {
  const [state, formAction, pending] = useActionState(changePasswordAction, emptyFormState)

  return (
    <form action={formAction} noValidate>
      <Card>
        <CardContent className="pt-5 space-y-4">
          {state.error ? (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-[var(--radius)] bg-danger-bg border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] px-3.5 py-2.5"
            >
              <AlertCircle className="size-4.5 text-[var(--danger)] mt-0.5 shrink-0" aria-hidden />
              <p className="text-sm text-[var(--danger)]">{state.error}</p>
            </div>
          ) : null}

          <Field
            label="Current password"
            htmlFor="currentPassword"
            required
            error={state.fieldErrors.currentPassword}
          >
            <Input
              id="currentPassword"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
            />
          </Field>

          <Field
            label="New password"
            htmlFor="newPassword"
            required
            error={state.fieldErrors.newPassword}
            hint={`At least ${minLength} characters, with upper case, lower case and a number.`}
          >
            <Input
              id="newPassword"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              required
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
            />
          </Field>

          <p className="text-xs text-ink-subtle">
            Changing your password signs you out on every other device.
          </p>

          <Button type="submit" loading={pending}>
            {forced ? 'Set password and continue' : 'Update password'}
          </Button>
        </CardContent>
      </Card>
    </form>
  )
}
