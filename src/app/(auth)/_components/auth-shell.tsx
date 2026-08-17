import type { ResolvedTenant } from '@/server/tenant'
import { MyCampusViewLogo } from '@/components/brand/logo'
import { env } from '@/lib/env'

/**
 * The single-column frame the secondary auth pages share — reset, invite and
 * anything else reached from a link rather than from the sign-in screen. The
 * school's own name and mark go at the top: a parent arriving from an email
 * needs to recognise where the link took them before they type a password.
 */
export function AuthShell({
  tenant,
  title,
  subtitle,
  children,
}: {
  tenant: ResolvedTenant | null
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  const school = tenant?.school
  const name = school?.name ?? tenant?.name ?? env().APP_NAME

  return (
    <div className="min-h-dvh flex flex-col justify-center px-6 sm:px-12 py-10">
      <div className="w-full max-w-sm mx-auto">
        {tenant ? (
          <div className="flex items-center gap-2.5 mb-8">
            {school?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={school.logoUrl} alt="" className="size-9 rounded object-contain" />
            ) : (
              <span className="size-9 rounded-[var(--radius-sm)] bg-[var(--brand-500)] text-[var(--brand-contrast)] grid place-items-center font-semibold text-lg">
                {name.charAt(0)}
              </span>
            )}
            <span className="font-semibold text-lg text-ink">{name}</span>
          </div>
        ) : (
          /* No school resolved: this is the platform console, and the mark
             above the form is the product's own. */
          <div className="mb-8">
            <MyCampusViewLogo variant="compact" size="lg" animated />
          </div>
        )}

        <h1 className="text-2xl font-semibold text-ink">{title}</h1>
        {subtitle ? <p className="text-base text-ink-muted mt-1 mb-6">{subtitle}</p> : <div className="mb-6" />}

        {children}
      </div>
    </div>
  )
}
