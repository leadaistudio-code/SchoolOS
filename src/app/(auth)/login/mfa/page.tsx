import { redirect } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
import { MfaChallengeForm } from './mfa-form'
import { resolveTenant } from '@/server/tenant'
import { getSessionUser } from '@/server/auth/session'
import { env } from '@/lib/env'

export const metadata = { title: 'Authenticator code' }

export default async function MfaLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; next?: string }>
}) {
  const [tenant, user, params] = await Promise.all([
    resolveTenant(),
    getSessionUser(),
    searchParams,
  ])

  if (user) {
    redirect(tenant ? '/' : '/platform')
  }

  if (!params.token) {
    redirect('/login')
  }

  const title = tenant?.school?.name ?? env().APP_NAME

  return (
    <div className="min-h-dvh flex flex-col justify-center px-6 sm:px-12 py-10">
      <div className="w-full max-w-sm mx-auto">
        <div className="flex items-center gap-2.5 mb-8">
          <span className="size-9 rounded-[var(--radius-sm)] bg-[var(--brand-500)] text-[var(--brand-contrast)] grid place-items-center font-semibold text-lg">
            {title.charAt(0)}
          </span>
          <span className="font-semibold text-lg text-ink">{title}</span>
        </div>

        <h1 className="text-2xl font-semibold text-ink">Two-step verification</h1>
        <p className="text-base text-ink-muted mt-1 mb-6">
          Enter the 6-digit code from your authenticator app to finish signing in.
        </p>

        <MfaChallengeForm token={params.token} next={params.next} />

        <p className="mt-8 text-xs text-ink-subtle flex items-center gap-1.5">
          <ShieldCheck className="size-3.5" aria-hidden />
          This challenge expires in 10 minutes.
        </p>
        <p className="mt-3 text-xs">
          <a href="/login" className="text-[var(--brand-600)] hover:underline">
            Back to sign in
          </a>
        </p>
      </div>
    </div>
  )
}
