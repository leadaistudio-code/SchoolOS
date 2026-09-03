import Link from 'next/link'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { LogOut } from 'lucide-react'
import { getPlatformContext } from '@/server/context'
import { MyCampusViewLogo } from '@/components/brand/logo'
import { ThemeToggle } from '@/components/theme-toggle'
import { ToastProvider } from '@/components/ui/toast'
import { env } from '@/lib/env'

export const dynamic = 'force-dynamic'

/**
 * The platform console is a separate application shell from the school ERP.
 * Different audience, different navigation, and no chance of a tenant screen
 * accidentally rendering with cross-tenant data behind it.
 */
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getPlatformContext()
  if (!ctx) {
    const h = await headers()
    const path = h.get('x-pathname') ?? '/platform'
    redirect(`/login?next=${encodeURIComponent(path)}`)
  }

  const nav = [
    { label: 'Overview', href: '/platform' },
    ...(ctx.user.permissions.has('platform.crm')
      ? [
          { label: 'Growth CRM', href: '/platform/growth' },
          { label: 'Today', href: '/platform/growth/today' },
          { label: 'Templates', href: '/platform/growth/templates' },
        ]
      : []),
    { label: 'Schools', href: '/platform/tenants' },
    { label: 'Plans', href: '/platform/plans' },
    { label: 'Billing', href: '/platform/billing' },
    { label: 'Support', href: '/platform/support' },
    { label: 'Health', href: '/platform/health' },
  ]

  return (
    <ToastProvider>
      <div className="min-h-dvh bg-bg">
        <header className="bg-surface border-b border-line sticky top-0 z-30">
          <div className="max-w-[1600px] mx-auto px-4 sm:px-6 h-[var(--topbar-h)] flex items-center gap-4">
            <Link href="/platform" className="flex items-center gap-2 shrink-0">
              {/* The console is the one authenticated surface that is ours
                  rather than a school's, so it carries our mark. The symbol
                  alone: a console topbar is not the place for a lockup. */}
              <MyCampusViewLogo variant="mark" size="md" animated />
              <span className="font-semibold text-base text-ink">
                {env().APP_NAME} <span className="text-ink-subtle font-normal">Platform</span>
              </span>
            </Link>

            <nav
              className="flex items-center gap-1 ml-2 min-w-0 overflow-x-auto sm:ml-4"
              aria-label="Platform navigation"
            >
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={false}
                  className="px-2.5 py-1.5 rounded-[var(--radius-sm)] text-base text-ink-muted hover:bg-surface-2 hover:text-ink"
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="ml-auto flex items-center gap-2">
              <ThemeToggle />
              <span className="hidden md:block text-sm text-ink-muted">
                {ctx.user.firstName} {ctx.user.lastName}
              </span>
              <form action="/api/v1/auth/logout" method="post">
                <button
                  className="size-9 grid place-items-center rounded-[var(--radius-sm)] text-ink-muted hover:bg-surface-2"
                  aria-label="Sign out"
                >
                  <LogOut className="size-4.5" aria-hidden />
                </button>
              </form>
            </div>
          </div>
        </header>

        <main className="max-w-[1600px] mx-auto px-4 sm:px-6 py-5">{children}</main>
      </div>
    </ToastProvider>
  )
}
