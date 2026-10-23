'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  Activity,
  BarChart3,
  Building2,
  CalendarCheck,
  Camera,
  CreditCard,
  FileText,
  LayoutDashboard,
  LifeBuoy,
  Mail,
  Menu,
  Newspaper,
  Package,
  Sparkles,
  Timer,
  X,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const ICONS = {
  overview: LayoutDashboard,
  crm: BarChart3,
  discovery: Sparkles,
  capture: Camera,
  today: CalendarCheck,
  templates: FileText,
  mail: Mail,
  schools: Building2,
  plans: Package,
  billing: CreditCard,
  support: LifeBuoy,
  tapasya: Timer,
  blog: Newspaper,
  health: Activity,
} satisfies Record<string, LucideIcon>

export type PlatformNavItem = { label: string; href: string; icon: keyof typeof ICONS }

/** The most specific item wins, so /platform/growth/today does not also light up Growth CRM. */
function activeHref(pathname: string, items: PlatformNavItem[]): string | null {
  let best: string | null = null
  for (const item of items) {
    const hit = item.href === '/platform' ? pathname === '/platform' : pathname === item.href || pathname.startsWith(`${item.href}/`)
    if (hit && (!best || item.href.length > best.length)) best = item.href
  }
  if (!best && pathname.startsWith('/platform/mail')) best = items.find((i) => i.icon === 'mail')?.href ?? null
  return best
}

export function PlatformNav({ items }: { items: PlatformNavItem[] }) {
  const pathname = usePathname()
  const active = activeHref(pathname, items)

  return (
    <nav className="hidden min-w-0 items-center gap-0.5 overflow-x-auto xl:ml-2 xl:flex" aria-label="Platform navigation">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          prefetch={false}
          aria-current={item.href === active ? 'page' : undefined}
          className={cn(
            'whitespace-nowrap rounded-[var(--radius-sm)] px-2.5 py-1.5 text-base text-ink-muted hover:bg-surface-2 hover:text-ink',
            item.href === active && 'bg-surface-2 font-medium text-ink',
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  )
}

export function PlatformMobileMenu({
  items,
  userName,
  children,
}: {
  items: PlatformNavItem[]
  userName: string
  children?: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const active = activeHref(pathname, items)

  useEffect(() => setOpen(false), [pathname])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="xl:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="platform-menu"
        aria-label={open ? 'Close menu' : 'Open menu'}
        className="grid size-10 place-items-center rounded-[var(--radius-sm)] text-ink hover:bg-surface-2"
      >
        {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
      </button>

      {open ? (
        <div
          id="platform-menu"
          className="fixed inset-x-0 bottom-0 top-[var(--topbar-h)] z-40 overflow-y-auto border-t border-line bg-bg px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4"
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="min-w-0 truncate text-sm text-ink-muted">Signed in as {userName}</p>
            <div className="shrink-0 sm:hidden">{children}</div>
          </div>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {items.map((item) => {
              const Icon = ICONS[item.icon]
              const current = item.href === active
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    prefetch={false}
                    onClick={() => setOpen(false)}
                    aria-current={current ? 'page' : undefined}
                    className={cn(
                      'flex min-h-14 items-center gap-3 rounded-[var(--radius-md)] border border-line bg-surface px-3 text-sm font-medium text-ink active:bg-surface-2',
                      current && 'border-[var(--brand-500)] bg-[var(--brand-50)] text-[var(--brand-600)]',
                    )}
                  >
                    <Icon className="size-5 shrink-0" aria-hidden />
                    {item.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
