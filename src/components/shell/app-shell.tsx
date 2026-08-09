'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { X } from 'lucide-react'
import type { NavItem } from '@/lib/navigation'
import { Sidebar } from './sidebar'
import { Topbar, type TopbarUser } from './topbar'
import { Icon } from './icon'
import { cn } from '@/lib/utils'
import { ToastProvider } from '@/components/ui/toast'

/**
 * Application shell.
 *
 * Desktop gets a persistent sidebar; mobile gets a drawer plus a bottom bar
 * with the handful of destinations that matter on a phone. The mobile layout
 * is a distinct arrangement, not the desktop one squeezed narrower.
 */
export function AppShell({
  navigation,
  schoolName,
  logoUrl,
  user,
  unreadCount,
  children,
}: {
  navigation: NavItem[]
  schoolName: string
  logoUrl: string | null
  user: TopbarUser
  unreadCount: number
  children: React.ReactNode
}) {
  const [drawerOpen, setDrawerOpen] = React.useState(false)
  const pathname = usePathname()

  React.useEffect(() => {
    setDrawerOpen(false)
  }, [pathname])

  const mobileItems = navigation.filter((i) => i.mobile).slice(0, 4)

  return (
    <ToastProvider>
      <div className="min-h-dvh flex bg-bg">
        <aside className="hidden lg:flex w-[var(--sidebar-w)] shrink-0 border-r border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] flex-col sticky top-0 h-dvh">
          <Sidebar items={navigation} schoolName={schoolName} logoUrl={logoUrl} />
        </aside>

        {drawerOpen ? (
          <div className="lg:hidden fixed inset-0 z-50 flex">
            <div
              className="absolute inset-0 bg-black/45"
              onClick={() => setDrawerOpen(false)}
              aria-hidden
            />
            <div className="relative w-[var(--sidebar-w)] max-w-[85vw] bg-[var(--sidebar-bg)] h-full shadow-2xl">
              <button
                onClick={() => setDrawerOpen(false)}
                className="absolute top-3.5 right-3 size-8 grid place-items-center rounded-lg text-ink-muted hover:bg-surface-2 z-10"
                aria-label="Close navigation menu"
              >
                <X className="size-4.5" aria-hidden />
              </button>
              <Sidebar
                items={navigation}
                schoolName={schoolName}
                logoUrl={logoUrl}
                onNavigate={() => setDrawerOpen(false)}
              />
            </div>
          </div>
        ) : null}

        <div className="flex-1 min-w-0 flex flex-col">
          <Topbar user={user} unreadCount={unreadCount} onOpenMenu={() => setDrawerOpen(true)} />
          <main className="flex-1 px-3 sm:px-5 py-4 sm:py-5 pb-24 lg:pb-6">{children}</main>
        </div>

        <nav
          className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-surface/95 backdrop-blur border-t border-line no-print"
          aria-label="Primary"
        >
          <div className="grid grid-cols-4 h-16">
            {mobileItems.map((item) => {
              const active =
                item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex flex-col items-center justify-center gap-1 text-[10.5px] font-medium',
                    active ? 'text-[var(--brand-500)]' : 'text-ink-subtle',
                  )}
                >
                  <span
                    className={cn(
                      'size-8 rounded-[var(--radius-sm)] grid place-items-center transition-colors',
                      active ? 'bg-[var(--brand-50)]' : '',
                    )}
                  >
                    <Icon name={item.icon} className="size-[18px]" />
                  </span>
                  {item.label}
                </Link>
              )
            })}
          </div>
        </nav>
      </div>
    </ToastProvider>
  )
}
