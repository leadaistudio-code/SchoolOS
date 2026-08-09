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
              <span className="size-10 rounded-[var(--radius-sm)] bg-[var(--brand-500)] text-[var(--brand-contrast)] grid place-items-center font-bold text-[17px]">
                {title.charAt(0)}
              </span>
            )}
            <span className="font-bold text-[15px] text-ink">{title}</span>
          </div>

          <h1 className="text-[24px] font-bold text-ink tracking-tight">{headline}</h1>
          <p className="text-[13.5px] text-ink-muted mt-1.5 mb-7">{subtext}</p>

          <LoginForm next={params.next} />

          <p className="mt-8 text-[12px] text-ink-subtle flex items-center gap-1.5">
            <ShieldCheck className="size-3.5" aria-hidden />
            Sign-in attempts are rate limited and recorded.
          </p>

          {school?.footerText ? (
            <p className="mt-6 text-[12px] text-ink-subtle border-t border-line pt-4">
              {school.footerText}
            </p>
          ) : null}
        </div>
      </div>

      {/* Right: brand panel, built from the tenant palette rather than an image
          so every school gets a coherent login page with zero assets. */}
      <div
        className="hidden lg:block relative overflow-hidden"
        style={{
          background:
            'linear-gradient(160deg, var(--brand-500) 0%, var(--brand-700) 55%, var(--accent-600) 100%)',
        }}
      >
        <div className="absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
            backgroundSize: '28px 28px',
          }}
          aria-hidden
        />
        <div className="relative h-full flex flex-col justify-end p-12 text-white">
          <blockquote className="max-w-md">
            <p className="text-[22px] leading-snug font-semibold">
              One place for attendance, fees, homework, results and transport - for staff,
              students and parents alike.
            </p>
            <footer className="mt-4 text-white/75 text-[13.5px]">
              {title} runs on {env().APP_NAME}
            </footer>
          </blockquote>
        </div>
      </div>
    </div>
  )
}
