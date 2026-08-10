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

const COLLAPSE_KEY = 'schoolos.nav.collapsed'

/**
 * Application shell.
 *
 * Desktop gets a persistent rail that can collapse to icons; a phone gets a
 * drawer plus a bottom bar with the handful of destinations that matter
 * there. The mobile layout is a distinct arrangement, not the desktop one
 * squeezed narrower.
 *
 * The collapsed state is remembered per browser rather than per account: it
 * is a statement about the screen in front of you, not a preference that
 * should follow you onto a different machine.
 */
export function AppShell({
  navigation,
  schoolName,
  logoUrl,
  user,
  unreadCount,
  unreadMessages,
  sessionName,
  children,
}: {
  navigation: NavItem[]
  schoolName: string
  logoUrl: string | null
  user: TopbarUser
  unreadCount: number
  unreadMessages: number
  sessionName: string | null
  children: React.ReactNode
}) {
  const [drawerOpen, setDrawerOpen] = React.useState(false)
  const [collapsed, setCollapsed] = React.useState(false)
  const pathname = usePathname()

  // Read after mount: the server has no way to know, and rendering the
  // collapsed rail on the server would flash the wrong width for everyone
  // who has not collapsed it.
  React.useEffect(() => {
    setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === '1')
  }, [])

  const toggleCollapse = () => {
    setCollapsed((current) => {
      window.localStorage.setItem(COLLAPSE_KEY, current ? '0' : '1')
      return !current
    })
  }

  React.useEffect(() => {
    setDrawerOpen(false)
  }, [pathname])

  React.useEffect(() => {
    if (!drawerOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  const mobileItems = navigation.filter((item) => item.mobile).slice(0, 4)

  return (
    <ToastProvider>
      <div className="flex min-h-dvh bg-bg">
        <aside
          className="no-print sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] transition-[width] duration-200 lg:flex"
          style={{ width: collapsed ? 'var(--sidebar-w-collapsed)' : 'var(--sidebar-w)' }}
        >
          <Sidebar
            items={navigation}
            schoolName={schoolName}
            logoUrl={logoUrl}
            collapsed={collapsed}
          />
        </aside>

        {drawerOpen ? (
          <div className="fixed inset-0 z-50 flex lg:hidden" role="dialog" aria-modal="true">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => setDrawerOpen(false)}
              aria-hidden
            />
            <div className="relative h-full w-[var(--sidebar-w)] max-w-[85vw] border-r border-[var(--sidebar-border)] bg-[var(--sidebar-bg)]">
              <button
                onClick={() => setDrawerOpen(false)}
                className="absolute right-2 top-3 z-10 grid size-8 place-items-center rounded-[8px] text-[var(--sidebar-fg)] hover:bg-[var(--sidebar-hover)]"
                aria-label="Close navigation menu"
              >
                <X className="size-4" aria-hidden />
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

        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar
            user={user}
            unreadCount={unreadCount}
            unreadMessages={unreadMessages}
            sessionName={sessionName}
            collapsed={collapsed}
            onToggleCollapse={toggleCollapse}
            onOpenMenu={() => setDrawerOpen(true)}
          />
          {/* One page container: every screen gets the same gutters and the
              same maximum measure, so nothing has to set its own. */}
          <main className="w-full max-w-[1600px] flex-1 px-4 py-5 pb-24 sm:px-6 lg:pb-8">
            {children}
          </main>
        </div>

        <nav
          className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface lg:hidden"
          aria-label="Primary"
        >
          <div className="grid grid-cols-4">
            {mobileItems.map((item) => {
              const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex h-14 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors',
                    active ? 'text-[var(--product-600)]' : 'text-ink-subtle',
                  )}
                >
                  <Icon name={item.icon} className="size-[18px]" />
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
