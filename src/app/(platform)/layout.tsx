import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Camera, LogOut } from 'lucide-react'
import { getPlatformContext } from '@/server/context'
import { MyCampusViewLogo } from '@/components/brand/logo'
import { ThemeToggle } from '@/components/theme-toggle'
import { ToastProvider } from '@/components/ui/toast'
import { env } from '@/lib/env'
import { PlatformMobileMenu, PlatformNav, type PlatformNavItem } from './platform-nav'

export const dynamic = 'force-dynamic'

/**
 * The platform console is a separate application shell from the school ERP.
 * Different audience, different navigation, and no chance of a tenant screen
 * accidentally rendering with cross-tenant data behind it.
 */
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getPlatformContext()
  if (!ctx) {
    // Never bounce tenant sessions with ?next=/platform — that loops with login.
    // Login will explain the mismatch and offer the school URL or sign-out.
    redirect('/login')
  }

  const nav: PlatformNavItem[] = [
    { label: 'Overview', href: '/platform', icon: 'overview' },
    ...(ctx.user.permissions.has('platform.crm')
      ? ([
          { label: 'Growth CRM', href: '/platform/growth', icon: 'crm' },
          { label: 'AI Discovery', href: '/platform/growth/discovery', icon: 'discovery' },
          { label: 'Capture', href: '/platform/growth/capture', icon: 'capture' },
          { label: 'Today', href: '/platform/growth/today', icon: 'today' },
          { label: 'Templates', href: '/platform/growth/templates', icon: 'templates' },
          { label: 'Reminders', href: '/platform/growth/reminders', icon: 'reminders' },
          { label: 'Blog', href: '/platform/blog', icon: 'blog' },
        ] satisfies PlatformNavItem[])
      : []),
    ...(ctx.user.isSuperAdmin || ctx.user.permissions.has('platform.crm_comms')
      ? ([{ label: 'Mail', href: '/platform/mail/inbox', icon: 'mail' }] satisfies PlatformNavItem[])
      : []),
    { label: 'Schools', href: '/platform/tenants', icon: 'schools' },
    { label: 'Plans', href: '/platform/plans', icon: 'plans' },
    { label: 'Billing', href: '/platform/billing', icon: 'billing' },
    { label: 'Support', href: '/platform/support', icon: 'support' },
    ...(ctx.user.permissions.has('platform.tapasya')
      ? ([{ label: 'Tapasya', href: '/platform/tapasya', icon: 'tapasya' }] satisfies PlatformNavItem[])
      : []),
    { label: 'Health', href: '/platform/health', icon: 'health' },
  ]
  const canCapture = ctx.user.permissions.has('platform.crm_create')
  const userName = `${ctx.user.firstName} ${ctx.user.lastName}`.trim()

  return (
    <ToastProvider>
      <div className="min-h-dvh bg-bg">
        <header className="bg-surface border-b border-line sticky top-0 z-30">
          <div className="max-w-[1600px] mx-auto px-3 sm:px-6 h-[var(--topbar-h)] flex items-center gap-2 sm:gap-4">
            <Link href="/platform" className="flex items-center gap-2 shrink-0">
              {/* The console is the one authenticated surface that is ours
                  rather than a school's, so it carries our mark. The symbol
                  alone: a console topbar is not the place for a lockup. */}
              <MyCampusViewLogo variant="mark" size="md" animated />
              <span className="font-semibold text-base text-ink">
                <span className="hidden sm:inline">{env().APP_NAME} </span>
                <span className="text-ink-subtle font-normal">Platform</span>
              </span>
            </Link>

            <PlatformNav items={nav} />

            <div className="ml-auto flex items-center gap-1 sm:gap-2">
              {canCapture ? (
                <Link
                  href="/platform/growth/capture"
                  prefetch={false}
                  className="flex h-9 items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--brand-500)] px-3 text-sm font-medium text-[var(--brand-contrast)] hover:bg-[var(--brand-600)] xl:hidden"
                >
                  <Camera className="size-4" aria-hidden />
                  Visit
                </Link>
              ) : null}
              <div className="hidden sm:block">
                <ThemeToggle />
              </div>
              <span className="hidden 2xl:block text-sm text-ink-muted">{userName}</span>
              <form action="/api/v1/auth/logout" method="post">
                <button
                  className="size-9 grid place-items-center rounded-[var(--radius-sm)] text-ink-muted hover:bg-surface-2"
                  aria-label="Sign out"
                >
                  <LogOut className="size-4.5" aria-hidden />
                </button>
              </form>
              <PlatformMobileMenu items={nav} userName={userName}>
                <ThemeToggle />
              </PlatformMobileMenu>
            </div>
          </div>
        </header>

        <main className="max-w-[1600px] mx-auto px-4 sm:px-6 py-5">{children}</main>
      </div>
    </ToastProvider>
  )
}
