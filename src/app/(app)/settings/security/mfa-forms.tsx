'use client'

import * as React from 'react'
import { useActionState } from 'react'
import { beginMfaEnrolmentAction, confirmMfaEnrolmentAction, disableMfaAction } from './actions'
import { emptyFormState } from '@/lib/form-state'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'

export function MfaEnrolForm() {
  const toast = useToast()
  const [setup, setSetup] = React.useState<{ secret: string; qrDataUrl: string } | null>(null)
  const [starting, setStarting] = React.useState(false)
  const [state, action, pending] = useActionState(confirmMfaEnrolmentAction, emptyFormState)

  const start = async () => {
    setStarting(true)
    const result = await beginMfaEnrolmentAction()
    setStarting(false)
    if (!result.ok) {
      toast.push({ tone: 'error', title: 'Could not start setup', description: result.message })
      return
    }
    setSetup({ secret: result.secret, qrDataUrl: result.qrDataUrl })
  }

  return (
    <div className="space-y-4">
      {!setup ? (
        <Button type="button" size="sm" onClick={start} loading={starting}>
          Set up authenticator app
        </Button>
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={setup.qrDataUrl} alt="Authenticator QR code" className="size-44 rounded border border-line" />
          <p className="text-xs text-ink-muted break-all">
            Manual key: <code className="font-mono">{setup.secret}</code>
          </p>
          <form action={action} className="space-y-3 max-w-xs">
            {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
            {state.ok ? <Notice tone="success">{state.message ?? 'Enabled.'}</Notice> : null}
            <Field label="Confirm with a code" htmlFor="code" required error={state.fieldErrors.code}>
              <Input id="code" name="code" inputMode="numeric" maxLength={6} required autoComplete="one-time-code" />
            </Field>
            <Button type="submit" size="sm" loading={pending}>
              Enable MFA
            </Button>
          </form>
        </>
      )}
    </div>
  )
}

export function MfaDisableForm() {
  const [state, action, pending] = useActionState(disableMfaAction, emptyFormState)

  return (
    <form action={action} className="space-y-3 max-w-sm">
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.ok ? <Notice tone="success">{state.message ?? 'Disabled.'}</Notice> : null}
      <Field label="Password" htmlFor="password" required error={state.fieldErrors.password}>
        <Input id="password" name="password" type="password" required autoComplete="current-password" />
      </Field>
      <Field label="Authenticator code" htmlFor="code" required error={state.fieldErrors.code}>
        <Input id="code" name="code" inputMode="numeric" maxLength={6} required autoComplete="one-time-code" />
      </Field>
      <Button type="submit" size="sm" variant="secondary" loading={pending}>
        Disable MFA
      </Button>
    </form>
  )
}
