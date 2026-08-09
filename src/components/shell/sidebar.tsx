'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import type { NavItem } from '@/lib/navigation'
import { cn } from '@/lib/utils'
import { Icon } from './icon'

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

/**
 * Primary navigation.
 *
 * Follows the reference's menu language: a light rail, grouped sections with
 * small uppercase captions, tinted icon tiles, and an active item that fills
 * with the brand colour rather than merely tinting. Collapsed children sit
 * behind a hairline guide so the hierarchy survives a long menu.
 */
export function Sidebar({
  items,
  schoolName,
  logoUrl,
  onNavigate,
}: {
  items: NavItem[]
  schoolName: string
  logoUrl: string | null
  onNavigate?: () => void
}) {
  const pathname = usePathname()

  // The reference groups its menu; ours is derived from the nav tree so the
  // captions stay correct as modules are enabled or hidden by plan.
  const groups = React.useMemo(() => groupItems(items), [items])

  return (
    <nav className="flex h-full flex-col bg-[var(--sidebar-bg)]" aria-label="Main navigation">
      <div className="h-[var(--topbar-h)] flex items-center gap-2.5 px-4 border-b border-[var(--sidebar-border)] shrink-0">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="size-8 rounded-[var(--radius-sm)] object-contain" />
        ) : (
          <span className="size-8 rounded-[var(--radius-sm)] bg-[var(--brand-500)] text-[var(--brand-contrast)] grid place-items-center text-[13px] font-bold shrink-0">
            {schoolName.charAt(0)}
          </span>
        )}
        <span className="font-bold text-[14.5px] text-ink truncate">{schoolName}</span>
      </div>

      <div className="flex-1 overflow-y-auto scroll-thin px-3 py-3 space-y-4">
        {groups.map((group) => (
          <div key={group.caption}>
            <p className="px-2 mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
              {group.caption}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavNode
                  key={item.href}
                  item={item}
                  pathname={pathname}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </nav>
  )
}

function NavNode({
  item,
  pathname,
  onNavigate,
}: {
  item: NavItem
  pathname: string
  onNavigate?: () => void
}) {
  const active = isActive(pathname, item.href)
  const hasChildren = !!item.children?.length
  const [open, setOpen] = React.useState(active)

  React.useEffect(() => {
    if (active) setOpen(true)
  }, [active])

  if (!hasChildren) {
    return (
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'group flex items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-2 text-[13px] font-medium transition-colors',
          active
            ? 'bg-[var(--brand-500)] text-[var(--brand-contrast)] shadow-[var(--shadow-card)]'
            : 'text-ink-muted hover:bg-[var(--brand-50)] hover:text-[var(--brand-500)]',
        )}
      >
        <span
          className={cn(
            'size-7 rounded-[6px] grid place-items-center shrink-0 transition-colors',
            active
              ? 'bg-white/20'
              : 'bg-[var(--menu-icon-bg)] text-ink-muted group-hover:bg-white group-hover:text-[var(--brand-500)]',
          )}
        >
          <Icon name={item.icon} className="size-4" />
        </span>
        <span className="truncate">{item.label}</span>
      </Link>
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          'group w-full flex items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-2 text-[13px] font-medium transition-colors',
          active
            ? 'text-[var(--brand-500)] bg-[var(--brand-50)]'
            : 'text-ink-muted hover:bg-[var(--brand-50)] hover:text-[var(--brand-500)]',
        )}
      >
        <span
          className={cn(
            'size-7 rounded-[6px] grid place-items-center shrink-0 transition-colors',
            active
              ? 'bg-white text-[var(--brand-500)]'
              : 'bg-[var(--menu-icon-bg)] text-ink-muted group-hover:bg-white group-hover:text-[var(--brand-500)]',
          )}
        >
          <Icon name={item.icon} className="size-4" />
        </span>
        <span className="truncate flex-1 text-left">{item.label}</span>
        <ChevronRight
          className={cn('size-3.5 transition-transform text-ink-subtle', open && 'rotate-90')}
          aria-hidden
        />
      </button>

      {open ? (
        <div className="ml-[1.35rem] pl-3 border-l border-line space-y-0.5 mt-0.5 mb-1">
          {item.children!.map((child) => {
            const childActive = pathname === child.href
            return (
              <Link
                key={child.href}
                href={child.href}
                onClick={onNavigate}
                aria-current={childActive ? 'page' : undefined}
                className={cn(
                  'relative block rounded-[6px] px-2.5 py-1.5 text-[12.5px] transition-colors',
                  childActive
                    ? 'text-[var(--brand-500)] font-semibold'
                    : 'text-ink-muted hover:text-[var(--brand-500)]',
                )}
              >
                {childActive ? (
                  <span
                    className="absolute -left-[13px] top-1/2 -translate-y-1/2 size-1.5 rounded-full bg-[var(--brand-500)]"
                    aria-hidden
                  />
                ) : null}
                {child.label}
              </Link>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

/**
 * Splits the flat navigation tree into captioned sections. Anything not
 * explicitly mapped falls into "Management", so a newly added module still
 * appears rather than vanishing.
 */
function groupItems(items: NavItem[]): { caption: string; items: NavItem[] }[] {
  const MAIN = new Set(['/'])
  const PEOPLE = new Set(['/students', '/parents', '/staff'])
  const ACADEMIC = new Set(['/attendance', '/academics', '/exams', '/leave'])
  const OPERATIONS = new Set([
    '/finance',
    '/communication',
    '/admissions',
    '/front-office',
    '/transport',
    '/library',
    '/inventory',
    '/sports',
    '/events',
  ])
  const SYSTEM = new Set(['/website', '/reports', '/settings'])

  const buckets: Record<string, NavItem[]> = {
    Main: [],
    People: [],
    Academic: [],
    Operations: [],
    System: [],
    Management: [],
  }

  for (const item of items) {
    if (MAIN.has(item.href)) buckets.Main!.push(item)
    else if (PEOPLE.has(item.href)) buckets.People!.push(item)
    else if (ACADEMIC.has(item.href)) buckets.Academic!.push(item)
    else if (OPERATIONS.has(item.href)) buckets.Operations!.push(item)
    else if (SYSTEM.has(item.href)) buckets.System!.push(item)
    else buckets.Management!.push(item)
  }

  return Object.entries(buckets)
    .filter(([, list]) => list.length > 0)
    .map(([caption, list]) => ({ caption, items: list }))
}
