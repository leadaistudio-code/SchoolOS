import { redirect } from 'next/navigation'
import { MessageCircle } from 'lucide-react'
import { VerifyOtpForm } from './verify-form'
import { AuthShell } from '../../_components/auth-shell'
import { getSessionUser } from '@/server/auth/session'
import { resolveTenant } from '@/server/tenant'
import { destinationForExistingSession } from '@/server/auth/login-redirect'

export const metadata = { title: 'Enter your code' }

export default async function VerifyOtpPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; to?: string }>
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
  // No challenge means somebody arrived here directly.
  if (!params.c) redirect('/forgot-password')

  return (
    <AuthShell
      tenant={tenant}
      title="Enter your code"
      subtitle={
        params.to
          ? `We sent a 6-digit code on WhatsApp to ${params.to}.`
          : 'We sent a 6-digit code on WhatsApp to your registered number.'
      }
    >
      <VerifyOtpForm challenge={params.c} />

      <p className="mt-8 text-xs text-ink-subtle flex items-center gap-1.5">
        <MessageCircle className="size-3.5" aria-hidden />
        Not arrived? Check WhatsApp is installed on that number, or ask the school office.
      </p>
    </AuthShell>
  )
}
