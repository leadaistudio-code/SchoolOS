import * as React from 'react'
import Link from 'next/link'
import { StudentsScene } from '@/components/illustrations/school-scene'
import { buttonVariants } from '@/components/ui/button-variants'

/**
 * The greeting strip.
 *
 * Carries three things worth the space: who is signed in, what today is, and
 * one line of actual news about the school. The illustration is decoration and
 * is the first thing to go when the viewport narrows — a phone should open on
 * the figures, not on a picture.
 */
export function WelcomeBanner({
  firstName,
  schoolName,
  headline,
  bannerUrl,
  action,
}: {
  firstName: string
  schoolName: string
  /** One line of real information — not a description of the dashboard. */
  headline: React.ReactNode
  /** Optional school banner from branding (login/dashboard strip). */
  bannerUrl?: string | null
  action?: { label: string; href: string }
}) {
  const now = new Date()
  const hour = now.getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <section className="rise-in relative overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface">
      {bannerUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={bannerUrl}
            alt=""
            className="pointer-events-none absolute inset-0 size-full object-cover"
          />
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-r from-surface via-surface/92 to-surface/75"
            aria-hidden
          />
        </>
      ) : (
        /* A tint rather than a picture: text has to stay first-class here. */
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(105deg, color-mix(in srgb, var(--product-500) 10%, var(--surface)) 0%, var(--surface) 52%, color-mix(in srgb, var(--chart-transport) 8%, var(--surface)) 100%)',
          }}
          aria-hidden
        />
      )}

      <div className="relative flex items-center gap-6 px-5 py-5 sm:px-7 sm:py-6">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-ink-subtle">
            {now.toLocaleDateString('en-IN', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-ink">
            {greeting}, {firstName}
            <span className="ml-1.5" aria-hidden>
              👋
            </span>
          </h1>
          <p className="mt-1 max-w-xl text-base text-ink-muted">{headline}</p>

          {action ? (
            <Link
              href={action.href}
              className={buttonVariants({ size: 'sm', className: 'mt-3.5' })}
            >
              {action.label}
            </Link>
          ) : null}

          <p className="sr-only">Signed in at {schoolName}</p>
        </div>

        {bannerUrl ? null : (
          <StudentsScene className="hidden h-32 w-56 shrink-0 lg:block xl:h-36 xl:w-64" />
        )}
      </div>
    </section>
  )
}
