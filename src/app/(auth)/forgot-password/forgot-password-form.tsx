'use client'

import * as React from 'react'
import { useActionState } from 'react'
import Link from 'next/link'
import { AlertCircle, CheckCircle2, KeyRound, Mail, MessageCircle } from 'lucide-react'
import { forgotPasswordAction, requestOtpAction } from './actions'
import { emptyFormState } from '@/lib/form-state'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type Method = 'whatsapp' | 'email'

/**
 * Choosing how to be reached.
 *
 * WhatsApp leads because the mobile number is the detail a school keeps
 * current; email is offered alongside rather than buried, because staff often
 * have a working address and no wish to use the school's WhatsApp. Both end at
 * the same place — a page where a new password is chosen.
 */
export function ForgotPasswordForm({ emailEnabled }: { emailEnabled: boolean }) {
  const [method, setMethod] = React.useState<Method>('whatsapp')

  return (
    <div className="space-y-5">
      {emailEnabled ? (
        <div
          role="tablist"
          aria-label="How to receive the reset"
          className="grid grid-cols-2 gap-1 rounded-[var(--radius)] bg-surface-2 p-1"
        >
          {(
            [
              { key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
              { key: 'email', label: 'Email', icon: Mail },
            ] as const
          ).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              role="tab"
              type="button"
              aria-selected={method === key}
              onClick={() => setMethod(key)}
              className={cn(
                'flex items-center justify-center gap-1.5 rounded-[var(--radius-sm)] px-3 py-2 text-sm font-medium transition-colors',
                method === key
                  ? 'bg-surface text-ink shadow-sm'
                  : 'text-ink-muted hover:text-ink',
              )}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {method === 'whatsapp' ? <WhatsappRequest /> : <EmailRequest />}

      <Link
        href="/login"
        className="inline-flex text-xs font-semibold text-[var(--brand-500)] hover:underline"
      >
        Back to sign in
      </Link>
    </div>
  )
}

function Notice({ tone, children }: { tone: 'error' | 'success'; children: React.ReactNode }) {
  const danger = tone === 'error'
  return (
    <div
      role={danger ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2.5 rounded-[var(--radius)] border px-3.5 py-2.5',
        danger
          ? 'bg-danger-bg border-[color-mix(in_srgb,var(--danger)_30%,transparent)]'
          : 'bg-success-bg border-[color-mix(in_srgb,var(--success)_30%,transparent)]',
      )}
    >
      {danger ? (
        <AlertCircle className="size-4.5 text-[var(--danger)] mt-0.5 shrink-0" aria-hidden />
      ) : (
        <CheckCircle2 className="size-4.5 text-[var(--success)] mt-0.5 shrink-0" aria-hidden />
      )}
      <p className="text-sm text-ink">{children}</p>
    </div>
  )
}

function WhatsappRequest() {
  const [state, formAction, pending] = useActionState(requestOtpAction, emptyFormState)

  // Reached only when WhatsApp could not deliver and a ticket was raised.
  if (state.ok) return <Notice tone="success">{state.message}</Notice>

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}

      <Field
        label="Mobile number"
        htmlFor="phone"
        required
        error={state.fieldErrors.phone}
        hint="The number the school has on record. We will send a code on WhatsApp."
      >
        <Input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          autoFocus
          placeholder="98765 43210"
          required
          aria-invalid={!!state.fieldErrors.phone}
        />
      </Field>

      <Button type="submit" size="lg" block loading={pending}>
        {!pending ? <MessageCircle className="size-4" aria-hidden /> : null}
        Send code on WhatsApp
      </Button>

      <p className="text-xs text-ink-subtle leading-relaxed">
        The code arrives on WhatsApp and lasts 10 minutes. If your number is not on WhatsApp, ask
        the school office to reset your password instead.
      </p>
    </form>
  )
}

function EmailRequest() {
  const [state, formAction, pending] = useActionState(forgotPasswordAction, emptyFormState)

  if (state.ok) return <Notice tone="success">{state.message}</Notice>

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}

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

      <Button type="submit" size="lg" block loading={pending}>
        {!pending ? <KeyRound className="size-4" aria-hidden /> : null}
        Send reset link
      </Button>

      <p className="text-xs text-ink-subtle leading-relaxed">
        For your safety we reply the same way whether or not the address is registered, so this page
        can never be used to find out who has an account here.
      </p>
    </form>
  )
}
