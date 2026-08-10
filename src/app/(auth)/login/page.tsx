import { redirect } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
import { LoginForm } from './login-form'
import { resolveTenant } from '@/server/tenant'
import { getSessionUser } from '@/server/auth/session'
import { env } from '@/lib/env'

export const metadata = { title: 'Sign in' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const [tenant, user, params] = await Promise.all([
    resolveTenant(),
    getSessionUser(),
    searchParams,
  ])

  if (user) redirect(tenant ? '/' : '/platform')

  const school = tenant?.school
  const title = school?.name ?? env().APP_NAME
  const headline = school?.loginHeadline ?? `Welcome to ${title}`
  const subtext =
    school?.loginSubtext ??
    (tenant
      ? 'Sign in to view attendance, homework, fees and results.'
      : 'Platform administration console.')

  return (
    <div className="min-h-dvh grid lg:grid-cols-2">
      {/* Left: the form. Kept first in the DOM so it is what a screen reader
          and a phone user reach immediately. */}
      <div className="flex flex-col justify-center px-6 sm:px-12 py-10">
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

          <h1 className="text-2xl font-semibold text-ink">{headline}</h1>
          <p className="text-base text-ink-muted mt-1 mb-6">{subtext}</p>

          <LoginForm next={params.next} />

          <p className="mt-8 text-xs text-ink-subtle flex items-center gap-1.5">
            <ShieldCheck className="size-3.5" aria-hidden />
            Sign-in attempts are rate limited and recorded.
          </p>

          {school?.footerText ? (
            <p className="mt-6 text-xs text-ink-subtle border-t border-line pt-4">
              {school.footerText}
            </p>
          ) : null}
        </div>
      </div>

      {/* Right: a plain brand field. No gradient, no pattern — the sign-in
          page should look like the product it opens, not like a campaign. */}
      <div className="hidden lg:flex flex-col justify-end p-12 bg-[var(--brand-700)] text-white">
        <p className="text-xl leading-snug max-w-md">
          Attendance, fees, homework, results and transport in one record system.
        </p>
        <p className="mt-3 text-base text-white/70">
          {title} runs on {env().APP_NAME}
        </p>
      </div>
    </div>
  )
}
