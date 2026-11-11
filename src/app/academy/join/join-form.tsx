'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'
import { signUpAction } from '../actions'

type Values = { firstName: string; lastName: string; email: string; phone: string; password: string }

export function JoinForm({ next }: { next: string }) {
  const router = useRouter()
  const [form, setForm] = React.useState<Values>({ firstName: '', lastName: '', email: '', phone: '', password: '' })
  const [error, setError] = React.useState<{ message: string; field?: string } | null>(null)
  const [pending, startTransition] = React.useTransition()
  const set = (key: keyof Values) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const fieldError = (key: keyof Values) => (error?.field === key ? error.message : undefined)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await signUpAction(form)
      if (!result.ok) {
        setError({ message: result.message, field: result.field })
        return
      }
      router.push(next)
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      {error && !error.field ? <Notice tone="danger">{error.message}</Notice> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="First name" required htmlFor="j-first" error={fieldError('firstName')}>
          <Input id="j-first" autoComplete="given-name" value={form.firstName} onChange={set('firstName')} />
        </Field>
        <Field label="Last name" htmlFor="j-last" error={fieldError('lastName')}>
          <Input id="j-last" autoComplete="family-name" value={form.lastName} onChange={set('lastName')} />
        </Field>
      </div>
      <Field label="Email" required htmlFor="j-email" hint="You sign in with this" error={fieldError('email')}>
        <Input id="j-email" type="email" autoComplete="email" value={form.email} onChange={set('email')} />
      </Field>
      <Field label="Mobile number" htmlFor="j-phone" hint="Optional. For class reminders." error={fieldError('phone')}>
        <Input id="j-phone" type="tel" autoComplete="tel" inputMode="tel" value={form.phone} onChange={set('phone')} />
      </Field>
      <Field label="Password" required htmlFor="j-password" hint="At least 8 characters" error={fieldError('password')}>
        <Input id="j-password" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} />
      </Field>
      <Button type="submit" block size="lg" loading={pending}>
        Create account
      </Button>
      <p className="text-xs text-ink-subtle">
        By joining you agree to the <a href="/academy/terms" className="underline">terms and refund policy</a>. Under 18? Ask a parent to create the account with you.
      </p>
    </form>
  )
}
