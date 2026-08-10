'use client'

import * as React from 'react'
import { useActionState } from 'react'
import { AlertCircle, Eye, EyeOff, LogIn } from 'lucide-react'
import { loginAction } from './actions'
import { emptyFormState } from '@/lib/form-state'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(loginAction, emptyFormState)
  const [showPassword, setShowPassword] = React.useState(false)

  return (
    <form action={formAction} className="space-y-4" noValidate>
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

      <Field
        label="Email or phone"
        htmlFor="identifier"
        required
        error={state.fieldErrors.identifier}
      >
        <Input
          id="identifier"
          name="identifier"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="you@school.edu"
          required
          aria-invalid={!!state.fieldErrors.identifier}
        />
      </Field>

      <Field label="Password" htmlFor="password" required error={state.fieldErrors.password}>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="Enter your password"
            required
            className="pr-10"
            aria-invalid={!!state.fieldErrors.password}
          />
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-subtle hover:text-ink"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
          </button>
        </div>
      </Field>

      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs text-ink-muted">
          <input type="checkbox" name="remember" className="size-4 rounded-[3px] border border-line-strong accent-[var(--brand-500)]" defaultChecked />
          Keep me signed in
        </label>
        <a href="/forgot-password" className="text-xs font-semibold text-[var(--brand-500)] hover:underline">
          Forgot password?
        </a>
      </div>

      <Button type="submit" size="lg" block loading={pending}>
        {!pending ? <LogIn className="size-4" aria-hidden /> : null}
        Sign in
      </Button>
    </form>
  )
}
