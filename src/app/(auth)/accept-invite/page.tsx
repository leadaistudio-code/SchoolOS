import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertCircle, ShieldCheck } from 'lucide-react'
import { SetPasswordForm } from '../_components/set-password-form'
import { AuthShell } from '../_components/auth-shell'
import { acceptInviteAction } from './actions'
import { inspectToken } from '@/server/auth/reset'
import { getSessionUser } from '@/server/auth/session'
import { resolveTenant } from '@/server/tenant'
import { destinationForExistingSession } from '@/server/auth/login-redirect'
import { passwordMinLength, passwordPolicyHint } from '@/server/auth/password'

export const metadata = { title: 'Set up your account' }

export default async function AcceptInvitePage({
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
  if (user) {
    const destination = destinationForExistingSession({ user, tenant })
    if (destination.kind === 'redirect') redirect(destination.href)
    redirect('/login')
  }

  const token = params.token ?? ''
  const link = token ? await inspectToken(token, 'INVITE', tenant.id) : { valid: false as const }

  if (!link.valid) {
    return (
      <AuthShell tenant={tenant} title="This invitation has expired">
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-[var(--radius)] bg-danger-bg border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] px-3.5 py-2.5"
        >
          <AlertCircle className="size-4.5 text-[var(--danger)] mt-0.5 shrink-0" aria-hidden />
          <p className="text-sm text-ink">
            Invitations last a week and work only once. Ask the school office to send you a new one.
          </p>
        </div>
        <Link
          href="/login"
          className="mt-4 inline-flex text-sm font-semibold text-[var(--brand-600)] hover:underline"
        >
          Back to sign in
        </Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      tenant={tenant}
      title={`Welcome, ${link.firstName}`}
      subtitle="Choose a password to finish setting up your account."
    >
      <SetPasswordForm
        action={acceptInviteAction}
        token={token}
        submitLabel="Create my account"
        minLength={passwordMinLength(link.roleKeys)}
        hint={passwordPolicyHint(link.roleKeys)}
      />

      <p className="mt-8 text-xs text-ink-subtle flex items-center gap-1.5">
        <ShieldCheck className="size-3.5" aria-hidden />
        {link.email
          ? `You will sign in with ${link.email}.`
          : 'You will sign in with the details the school holds for you.'}
      </p>
    </AuthShell>
  )
}
