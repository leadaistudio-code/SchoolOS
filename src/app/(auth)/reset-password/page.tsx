import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertCircle, ShieldCheck } from 'lucide-react'
import { SetPasswordForm } from '../_components/set-password-form'
import { resetPasswordAction } from './actions'
import { AuthShell } from '../_components/auth-shell'
import { inspectToken } from '@/server/auth/reset'
import { getSessionUser } from '@/server/auth/session'
import { resolveTenant } from '@/server/tenant'
import { env } from '@/lib/env'

export const metadata = { title: 'Choose a new password' }

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const [tenant, user, params] = await Promise.all([
    resolveTenant(),
    getSessionUser(),
    searchParams,
  ])

  if (!tenant) redirect('/login')
  if (user) redirect('/')

  const token = params.token ?? ''
  const link = token ? await inspectToken(token, 'PASSWORD_RESET', tenant.id) : { valid: false as const }

  if (!link.valid) {
    return (
      <AuthShell tenant={tenant} title="This link has expired">
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-[var(--radius)] bg-danger-bg border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] px-3.5 py-2.5"
        >
          <AlertCircle className="size-4.5 text-[var(--danger)] mt-0.5 shrink-0" aria-hidden />
          <p className="text-sm text-ink">
            Reset links last an hour and work only once. This one has expired or has already been
            used.
          </p>
        </div>
        <Link
          href="/forgot-password"
          className="mt-4 inline-flex text-sm font-semibold text-[var(--brand-600)] hover:underline"
        >
          Request a new link
        </Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      tenant={tenant}
      title="Choose a new password"
      subtitle={`Hello ${link.firstName}. Pick a password you have not used here before.`}
    >
      <SetPasswordForm
        action={resetPasswordAction}
        token={token}
        submitLabel="Save password and sign in"
        minLength={env().PASSWORD_MIN_LENGTH}
      />

      <p className="mt-8 text-xs text-ink-subtle flex items-center gap-1.5">
        <ShieldCheck className="size-3.5" aria-hidden />
        Saving this signs out every device already using the old password.
      </p>
    </AuthShell>
  )
}
