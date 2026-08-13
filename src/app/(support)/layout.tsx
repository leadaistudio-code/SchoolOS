import Link from 'next/link'
import { redirect } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { getSessionUser } from '@/server/auth/session'
import { resolveTenant } from '@/server/tenant'
import { ToastProvider } from '@/components/ui/toast'

/**
 * Minimal shell for support-only access (including suspended schools).
 * Does not use the full ERP layout so suspended tenants are not blocked.
 */
export default async function SupportLayout({ children }: { children: React.ReactNode }) {
  const [user, tenant] = await Promise.all([getSessionUser(), resolveTenant()])
  if (!user || !tenant || user.tenantId !== tenant.id) redirect('/login')

  return (
    <ToastProvider>
      <div className="min-h-dvh bg-bg">
        <header className="border-b border-line bg-surface">
          <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-ink">{tenant.school?.name ?? tenant.name}</p>
              <p className="text-xs text-ink-subtle">Help &amp; Support</p>
            </div>
            <div className="flex items-center gap-3">
              {tenant.status === 'SUSPENDED' ? (
                <span className="text-xs text-warning">Account suspended</span>
              ) : (
                <Link href="/" className="text-xs text-[var(--brand-600)] hover:underline">
                  Back to app
                </Link>
              )}
              <form action="/api/v1/auth/logout" method="post">
                <button
                  type="submit"
                  className="size-8 grid place-items-center rounded-[var(--radius-sm)] text-ink-muted hover:bg-surface-2"
                  aria-label="Sign out"
                >
                  <LogOut className="size-4" aria-hidden />
                </button>
              </form>
            </div>
          </div>
        </header>
        <main className="max-w-3xl mx-auto px-4 py-6">{children}</main>
      </div>
    </ToastProvider>
  )
}
