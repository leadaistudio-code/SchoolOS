import { redirect } from 'next/navigation'
import { CheckCircle2, ShieldCheck } from 'lucide-react'
import { LoginForm } from './login-form'
import { MyCampusViewLogo } from '@/components/brand/logo'
import { resolveTenant } from '@/server/tenant'
import { getSessionUser } from '@/server/auth/session'
import { env } from '@/lib/env'

export const metadata = { title: 'Sign in' }

/**
 * Confirmations shown after a redirect here. Looked up from a fixed table
 * rather than printed from the query string, so the URL cannot be used to put
 * arbitrary text on a sign-in page.
 */
const LOGIN_NOTICES: Record<string, string | undefined> = {
  'password-set': 'Your password has been saved. Sign in with it to continue.',
  'account-ready': 'Your account is ready. Sign in with your new password.',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; notice?: string }>
}) {
  const [tenant, user, params] = await Promise.all([
    resolveTenant(),
    getSessionUser(),
    searchParams,
  ])

  if (user) {
    const next = params.next
    const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : null
    redirect(safeNext ?? (tenant ? '/' : '/platform'))
  }

  const school = tenant?.school
  const title = school?.name ?? env().APP_NAME
  const headline = school?.loginHeadline ?? `Welcome to ${title}`
  const subtext =
    school?.loginSubtext ??
    (tenant
      ? 'Sign in to view attendance, homework, fees and results.'
      : 'Platform administration console.')
  const bannerUrl = school?.loginBannerUrl ?? null
  const notice = LOGIN_NOTICES[params.notice ?? '']

  return (
    <div className="min-h-dvh grid lg:grid-cols-2">
      {/* Left: the form. Kept first in the DOM so it is what a screen reader
          and a phone user reach immediately. */}
      <div className="flex flex-col justify-center px-6 sm:px-12 py-10">
        <div className="w-full max-w-sm mx-auto">
          {/* Whose page this is. A school's own mark on a school's address;
              the product's own mark only on the platform console, where there
              is no school to represent. */}
          {tenant ? (
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
          ) : (
            <div className="mb-9">
              <MyCampusViewLogo variant="full" size="xl" animated shimmer priority />
            </div>
          )}

          {bannerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={bannerUrl}
              alt=""
              className="mb-6 w-full max-h-36 rounded-[var(--radius)] object-cover border border-line lg:hidden"
            />
          ) : null}

          <div className={tenant ? undefined : 'mcv-auth-reveal'}>
            <h1 className="text-2xl font-semibold text-ink">{headline}</h1>
            <p className="text-base text-ink-muted mt-1 mb-6">{subtext}</p>

            {notice ? (
              <div
                role="status"
                className="mb-5 flex items-start gap-2.5 rounded-[var(--radius)] bg-success-bg border border-[color-mix(in_srgb,var(--success)_30%,transparent)] px-3.5 py-2.5"
              >
                <CheckCircle2
                  className="size-4.5 text-[var(--success)] mt-0.5 shrink-0"
                  aria-hidden
                />
                <p className="text-sm text-ink">{notice}</p>
              </div>
            ) : null}

            <LoginForm next={params.next} showForgotPassword={!!tenant} />
          </div>

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

      {/* Right: school banner on desktop, or brand tint when none is set. */}
      <div
        className="hidden lg:flex flex-col justify-end p-12 text-white relative overflow-hidden min-h-[320px]"
        style={
          bannerUrl
            ? undefined
            : { background: 'var(--brand-700)' }
        }
      >
        {bannerUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={bannerUrl}
              alt=""
              className="absolute inset-0 size-full object-cover"
            />
            <div
              className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/35 to-black/20"
              aria-hidden
            />
          </>
        ) : null}
        <div className="relative max-w-md">
          <p className="text-xl leading-snug">
            Attendance, fees, homework, results and transport in one record system.
          </p>
          {tenant ? (
            <p className="mt-3 text-base text-white/70">
              {title} runs on {env().APP_NAME}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
