import { redirect } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
import { ForgotPasswordForm } from './forgot-password-form'
import { resolveTenant } from '@/server/tenant'
import { getSessionUser } from '@/server/auth/session'
import { env } from '@/lib/env'

export const metadata = { title: 'Forgot password' }

export default async function ForgotPasswordPage() {
  const [tenant, user] = await Promise.all([resolveTenant(), getSessionUser()])

  if (!tenant) redirect('/login')
  if (user) redirect('/')

  const school = tenant.school
  const title = school?.name ?? tenant.name

  return (
    <div className="min-h-dvh flex flex-col justify-center px-6 sm:px-12 py-10">
      <div className="w-full max-w-sm mx-auto">
        <div className="flex items-center gap-2.5 mb-8">
          {school?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={school.logoUrl} alt="" className="size-9 rounded object-contain" />
          ) : (
            <span className="size-9 rounded-[var(--radius-sm)] bg-[var(--brand-500)] text-[var(--brand-contrast)] grid place-items-center font-semibold text-lg">
              {title.charAt(0)}
            </span>
          )}
          <span className="font-semibold text-lg text-ink">{title}</span>
        </div>

        <h1 className="text-2xl font-semibold text-ink">Forgot your password?</h1>
        <p className="text-base text-ink-muted mt-1 mb-6">
          Enter the email on your account. We will notify the {env().APP_NAME} platform team to
          reset it and contact you.
        </p>

        <ForgotPasswordForm />

        <p className="mt-8 text-xs text-ink-subtle flex items-center gap-1.5">
          <ShieldCheck className="size-3.5" aria-hidden />
          Requests are rate limited. Never share your password in the note field.
        </p>
      </div>
    </div>
  )
}
