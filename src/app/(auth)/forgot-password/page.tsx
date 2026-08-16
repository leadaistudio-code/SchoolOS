import { redirect } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
import { ForgotPasswordForm } from './forgot-password-form'
import { AuthShell } from '../_components/auth-shell'
import { canDeliverEmail } from '@/server/auth/reset'
import { resolveTenant } from '@/server/tenant'
import { getSessionUser } from '@/server/auth/session'

export const metadata = { title: 'Forgot password' }

export default async function ForgotPasswordPage() {
  const [tenant, user] = await Promise.all([resolveTenant(), getSessionUser()])

  if (!tenant) redirect('/login')
  if (user) redirect('/')

  // Offering an email tab that cannot send anything would be worse than not
  // offering one, so the choice depends on what this school has configured.
  const emailEnabled = await canDeliverEmail(tenant.id)

  return (
    <AuthShell
      tenant={tenant}
      title="Forgot your password?"
      subtitle="Confirm who you are and choose a new password. It takes about a minute."
    >
      <ForgotPasswordForm emailEnabled={emailEnabled} />

      <p className="mt-8 text-xs text-ink-subtle flex items-center gap-1.5">
        <ShieldCheck className="size-3.5" aria-hidden />
        Requests are rate limited, and resetting signs out every other device.
      </p>
    </AuthShell>
  )
}
