'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  CalendarDays,
  ChevronDown,
  KeyRound,
  LogOut,
  Menu,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  School,
  ShieldAlert,
} from 'lucide-react'
import { GlobalSearch } from './global-search'
import { NotificationMenu } from './notification-menu'
import { ThemeToggle } from '@/components/theme-toggle'
import { Avatar } from '@/components/ui/identity'
import { cn } from '@/lib/utils'

export type TopbarUser = {
  firstName: string
  lastName: string
  email: string | null
  roleLabel: string
  avatarUrl: string | null
  impersonated: boolean
}

const ICON_BUTTON =
  'grid size-9 place-items-center rounded-[10px] text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink'

/**
 * Application header.
 *
 * One 60px line holding the four things a user reaches for from any page:
 * where am I, find something, what happened, and who am I signed in as.
 * Breadcrumbs stay in PageHeader where they can name the record being viewed.
 *
 * The academic session is shown, not offered as a selector: the product has
 * one current session at a time and switching it is a Settings decision, so a
 * dropdown here would be a control that cannot do anything.
 */
export function Topbar({
  user,
  unreadCount,
  unreadMessages,
  sessionName,
  collapsed,
  onToggleCollapse,
  onOpenMenu,
  assistant,
}: {
  user: TopbarUser
  unreadCount: number
  unreadMessages: number
  sessionName: string | null
  collapsed: boolean
  onToggleCollapse: () => void
  onOpenMenu: () => void
  /**
   * The assistant launcher, or null when the school's plan or this user's role
   * does not include it. Passed in rather than imported so the shell does not
   * need to know about entitlements.
   */
  assistant?: React.ReactNode
}) {
  const [menuOpen, setMenuOpen] = React.useState(false)
  const menuRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  return (
    <header className="no-print sticky top-0 z-30 border-b border-line bg-[var(--topbar-bg)]">
      {user.impersonated ? (
        <div className="flex flex-wrap items-center justify-center gap-2 border-b border-[color-mix(in_srgb,var(--warning)_25%,transparent)] bg-warning-bg px-4 py-1.5 text-xs text-warning">
          <ShieldAlert className="size-3.5" aria-hidden />
          Impersonating this school. Every action is recorded in the audit log.
          <form action="/api/v1/auth/stop-impersonation" method="post">
            <button className="font-semibold underline">Exit</button>
          </form>
        </div>
      ) : null}

      <div className="flex h-[var(--topbar-h)] items-center gap-2 px-3 sm:px-4">
        <button
          type="button"
          onClick={onOpenMenu}
          className={cn(ICON_BUTTON, 'lg:hidden')}
          aria-label="Open navigation menu"
        >
          <Menu className="size-[18px]" aria-hidden />
        </button>

        <button
          type="button"
          onClick={onToggleCollapse}
          className={cn(ICON_BUTTON, 'hidden lg:grid')}
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-[18px]" aria-hidden />
          ) : (
            <PanelLeftClose className="size-[18px]" aria-hidden />
          )}
        </button>

        <GlobalSearch />

        {assistant ? <div className="ml-2 hidden sm:block">{assistant}</div> : null}

        <div className="ml-auto flex items-center gap-1">
          {sessionName ? (
            <span
              className="hidden items-center gap-1.5 rounded-[10px] border border-line px-2.5 py-1.5 text-xs font-medium text-ink-muted xl:inline-flex"
              title="Current academic session"
            >
              <CalendarDays className="size-3.5 text-ink-subtle" aria-hidden />
              {sessionName}
            </span>
          ) : null}

          <ThemeToggle className="hidden sm:inline-flex" />

          <Link
            href="/communication/messages"
            className={cn(ICON_BUTTON, 'relative hidden sm:grid')}
            aria-label={`Messages${unreadMessages ? `, ${unreadMessages} unread` : ''}`}
            title="Messages"
          >
            <MessageSquare className="size-[18px]" aria-hidden />
            {unreadMessages > 0 ? (
              <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--product-500)] px-1 text-[10px] font-semibold tnum text-white">
                {unreadMessages > 99 ? '99+' : unreadMessages}
              </span>
            ) : null}
          </Link>

          <NotificationMenu initialUnread={unreadCount} />

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              className="flex items-center gap-2 rounded-[10px] py-1 pl-1 pr-1.5 transition-colors hover:bg-surface-2"
            >
              <Avatar
                firstName={user.firstName}
                lastName={user.lastName}
                avatarUrl={user.avatarUrl}
                className="size-8"
              />
              <span className="hidden text-left leading-tight md:block">
                <span className="block text-sm font-semibold text-ink">
                  {user.firstName} {user.lastName}
                </span>
                <span className="block text-xs text-ink-subtle">{user.roleLabel}</span>
              </span>
              <ChevronDown className="hidden size-3.5 text-ink-subtle md:block" aria-hidden />
            </button>

            {menuOpen ? (
              <div
                role="menu"
                className="pop-in absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-[var(--radius)] border border-line bg-surface py-1 shadow-[var(--shadow-pop)]"
              >
                <div className="flex items-center gap-2.5 border-b border-line px-3 py-2.5">
                  <Avatar
                    firstName={user.firstName}
                    lastName={user.lastName}
                    avatarUrl={user.avatarUrl}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">
                      {user.firstName} {user.lastName}
                    </p>
                    <p className="truncate text-xs text-ink-subtle">{user.email}</p>
                  </div>
                </div>

                <MenuLink href="/account/password" icon={KeyRound} onClick={() => setMenuOpen(false)}>
                  Password &amp; security
                </MenuLink>
                <MenuLink href="/settings" icon={School} onClick={() => setMenuOpen(false)}>
                  School settings
                </MenuLink>

                <form action="/api/v1/auth/logout" method="post" className="border-t border-line pt-1">
                  <button
                    role="menuitem"
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
                  >
                    <LogOut className="size-4 text-ink-subtle" aria-hidden /> Sign out
                  </button>
                </form>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  )
}

function MenuLink({
  href,
  icon: LinkIcon,
  onClick,
  children,
}: {
  href: string
  icon: React.ElementType
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onClick}
      className="flex items-center gap-2.5 px-3 py-2 text-sm text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
    >
      <LinkIcon className="size-4 text-ink-subtle" aria-hidden />
      {children}
    </Link>
  )
}
