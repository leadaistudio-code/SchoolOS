'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell, ChevronRight, LogOut, Maximize2, Menu, ShieldAlert, User } from 'lucide-react'
import { GlobalSearch } from './global-search'
import { ThemeToggle } from '@/components/theme-toggle'
import { cn, initials } from '@/lib/utils'

export type TopbarUser = {
  firstName: string
  lastName: string
  email: string | null
  roleLabel: string
  avatarUrl: string | null
  impersonated: boolean
}

/** Derives breadcrumbs from the URL so no page has to declare them by hand. */
function useBreadcrumbs() {
  const pathname = usePathname()
  return React.useMemo(() => {
    const parts = pathname.split('/').filter(Boolean)
    return parts.map((part, i) => ({
      label: part
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .replace(/^C[a-z0-9]{20,}$/i, 'Details'),
      href: `/${parts.slice(0, i + 1).join('/')}`,
      last: i === parts.length - 1,
    }))
  }, [pathname])
}

/**
 * Application header.
 *
 * Matches the reference's chrome: a fixed 56px bar, pill-shaped icon buttons
 * on a tinted ground, and the user identity on the right. Breadcrumbs sit in
 * the page header rather than the bar, which keeps the bar to one line on a
 * laptop.
 */
export function Topbar({
  user,
  unreadCount,
  onOpenMenu,
}: {
  user: TopbarUser
  unreadCount: number
  onOpenMenu: () => void
}) {
  const crumbs = useBreadcrumbs()
  const [menuOpen, setMenuOpen] = React.useState(false)
  const menuRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const iconButton =
    'size-9 grid place-items-center rounded-[var(--radius-sm)] border border-[var(--topbar-item-border)] bg-[var(--topbar-item-bg)] text-ink-muted hover:text-[var(--brand-500)] hover:border-[var(--brand-500)] transition-colors'

  return (
    <header className="sticky top-0 z-30 bg-[var(--topbar-bg)] border-b border-line">
      {user.impersonated ? (
        <div className="flex items-center justify-center gap-2 bg-warning-bg text-warning text-[12.5px] py-1.5 px-4">
          <ShieldAlert className="size-4" aria-hidden />
          You are impersonating this school. Every action is recorded in the audit log.
          <form action="/api/v1/auth/stop-impersonation" method="post">
            <button className="underline font-semibold">Exit</button>
          </form>
        </div>
      ) : null}

      <div className="h-[var(--topbar-h)] flex items-center gap-3 px-3 sm:px-5">
        <button
          type="button"
          onClick={onOpenMenu}
          className={cn(iconButton, 'lg:hidden')}
          aria-label="Open navigation menu"
        >
          <Menu className="size-4.5" aria-hidden />
        </button>

        <GlobalSearch />

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle className="hidden sm:inline-flex" />

          <button
            type="button"
            onClick={() => document.documentElement.requestFullscreen?.()}
            className={cn(iconButton, 'hidden lg:grid')}
            aria-label="Enter full screen"
          >
            <Maximize2 className="size-4" aria-hidden />
          </button>

          <Link
            href="/communication/notifications"
            className={cn(iconButton, 'relative')}
            aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
          >
            <Bell className="size-4.5" aria-hidden />
            {unreadCount > 0 ? (
              <span className="absolute -top-1.5 -right-1.5 min-w-4.5 h-4.5 px-1 rounded-full bg-[var(--brand-500)] text-white text-[10px] font-bold grid place-items-center border-2 border-[var(--topbar-bg)]">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            ) : null}
          </Link>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              className="flex items-center gap-2.5 rounded-[var(--radius-sm)] pl-1 pr-2 py-1 hover:bg-surface-2 transition-colors"
            >
              <span className="size-8 rounded-[var(--radius-sm)] bg-[var(--brand-500)] text-[var(--brand-contrast)] grid place-items-center text-[12px] font-bold">
                {initials(user.firstName, user.lastName)}
              </span>
              <span className="hidden sm:block text-left leading-tight">
                <span className="block text-[13px] font-semibold text-ink">
                  {user.firstName} {user.lastName}
                </span>
                <span className="block text-[11px] text-ink-subtle">{user.roleLabel}</span>
              </span>
            </button>

            {menuOpen ? (
              <div
                role="menu"
                className="absolute right-0 mt-2 w-56 rounded-[var(--radius)] border border-line bg-surface shadow-[var(--shadow-pop)] py-1.5 z-50"
              >
                <div className="px-3 py-2 border-b border-line">
                  <p className="text-[13px] font-semibold text-ink truncate">
                    {user.firstName} {user.lastName}
                  </p>
                  <p className="text-[12px] text-ink-muted truncate">{user.email}</p>
                </div>
                <Link
                  href="/account"
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-[13px] text-ink-muted hover:bg-[var(--brand-50)] hover:text-[var(--brand-500)]"
                >
                  <User className="size-4" aria-hidden /> My account
                </Link>
                <form action="/api/v1/auth/logout" method="post">
                  <button
                    role="menuitem"
                    className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-ink-muted hover:bg-[var(--brand-50)] hover:text-[var(--brand-500)]"
                  >
                    <LogOut className="size-4" aria-hidden /> Sign out
                  </button>
                </form>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {crumbs.length > 0 ? (
        <nav
          aria-label="Breadcrumb"
          className="hidden sm:flex items-center gap-1 px-5 pb-2 text-[12px] text-ink-subtle"
        >
          <Link href="/" className="hover:text-[var(--brand-500)]">
            Home
          </Link>
          {crumbs.map((c) => (
            <React.Fragment key={c.href}>
              <ChevronRight className="size-3" aria-hidden />
              {c.last ? (
                <span className="text-ink font-medium" aria-current="page">
                  {c.label}
                </span>
              ) : (
                <Link href={c.href} className="hover:text-[var(--brand-500)]">
                  {c.label}
                </Link>
              )}
            </React.Fragment>
          ))}
        </nav>
      ) : null}
    </header>
  )
}
