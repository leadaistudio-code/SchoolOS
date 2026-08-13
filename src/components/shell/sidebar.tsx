'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronDown, PanelLeftClose, PanelLeftOpen, Sparkles } from 'lucide-react'
import { NAV_SECTIONS, type NavItem, type NavSection } from '@/lib/navigation'
import { cn } from '@/lib/utils'
import { Icon } from './icon'
import { SchoolScene } from '@/components/illustrations/school-scene'

const SECTION_LABEL: Record<NavSection, string> = {
  MAIN: 'Main',
  PEOPLE: 'People',
  ACADEMICS: 'Academics',
  FINANCE: 'Finance',
  OPERATIONS: 'Operations',
  ENGAGEMENT: 'Engagement',
  GROWTH: 'Growth',
  INSIGHTS: 'Insights',
  SYSTEM: 'System',
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

/**
 * Primary navigation.
 *
 * The rail follows the theme: light on a light page, dark on a dark one. It
 * separates itself from the content by one step of surface and a hairline
 * rather than by staying dark, so a school working in daylight is not looking
 * at a slab of night down the side of every screen.
 *
 * Grouping is declared on each item rather than inferred from a list of paths
 * here, so a new module lands in the right block by saying so.
 */
export function Sidebar({
  items,
  schoolName,
  logoUrl,
  collapsed = false,
  onNavigate,
  onToggleCollapse,
}: {
  items: NavItem[]
  schoolName: string
  logoUrl: string | null
  collapsed?: boolean
  onNavigate?: () => void
  /**
   * Collapse the rail to icons. Omitted on the mobile drawer, where the rail
   * has no collapsed state to reach — it closes instead.
   */
  onToggleCollapse?: () => void
}) {
  const pathname = usePathname()
  const groups = React.useMemo(() => groupItems(items), [items])

  return (
    <nav
      className="flex h-full flex-col bg-[var(--sidebar-bg)] text-[var(--sidebar-fg)]"
      aria-label="Main navigation"
    >
      <div
        className={cn(
          'flex h-[var(--topbar-h)] shrink-0 items-center gap-2.5 border-b border-[var(--sidebar-border)]',
          collapsed ? 'justify-center px-2' : 'px-4',
        )}
      >
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="size-8 shrink-0 rounded-[8px] object-contain" />
        ) : (
          <span
            className="grid size-8 shrink-0 place-items-center rounded-[9px] text-sm font-bold text-white"
            style={{ backgroundImage: 'var(--product-grad)' }}
            aria-hidden
          >
            {schoolName.charAt(0)}
          </span>
        )}
        {!collapsed ? (
          <>
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-semibold text-[var(--sidebar-fg-strong)]">
                {schoolName}
              </span>
              <span className="block truncate text-[11px] text-[var(--sidebar-caption)]">
                School management
              </span>
            </span>
            {onToggleCollapse ? (
              <CollapseButton collapsed={false} onClick={onToggleCollapse} className="ml-auto" />
            ) : null}
          </>
        ) : null}
      </div>

      {/* Collapsed, the header has no room beside the logo, so the control
          moves to its own row rather than disappearing — the rail must be
          re-openable from the rail itself. */}
      {collapsed && onToggleCollapse ? (
        <div className="flex shrink-0 justify-center border-b border-[var(--sidebar-border)] py-1.5">
          <CollapseButton collapsed onClick={onToggleCollapse} />
        </div>
      ) : null}

      <div className="scroll-thin flex-1 overflow-y-auto overflow-x-hidden px-2.5 py-3">
        {groups.map((group) => (
          <div key={group.section} className="mb-4 last:mb-0">
            {collapsed ? (
              <div className="mx-2 mb-2 h-px bg-[var(--sidebar-border)]" aria-hidden />
            ) : (
              <p className="caption mb-1.5 px-2 text-[var(--sidebar-caption)]">
                {SECTION_LABEL[group.section]}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.href}>
                  <NavNode
                    item={item}
                    pathname={pathname}
                    collapsed={collapsed}
                    onNavigate={onNavigate}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {!collapsed ? <PromoCard /> : null}
    </nav>
  )
}

const ROW =
  'group relative flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-base transition-colors duration-150'

const IDLE = 'text-[var(--sidebar-fg)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-fg-strong)]'

function NavNode({
  item,
  pathname,
  collapsed,
  onNavigate,
}: {
  item: NavItem
  pathname: string
  collapsed: boolean
  onNavigate?: () => void
}) {
  const active = isActive(pathname, item.href)
  const hasChildren = !!item.children?.length
  const [open, setOpen] = React.useState(active)

  React.useEffect(() => {
    if (active) setOpen(true)
  }, [active])

  // A collapsed rail hides the label, so the group has to become a link —
  // there is nothing left for a disclosure arrow to reveal.
  if (!hasChildren || collapsed) {
    const href = hasChildren ? (item.children![0]?.href ?? item.href) : item.href
    return (
      <Link
        href={href}
        onClick={onNavigate}
        aria-current={active ? 'page' : undefined}
        className={cn(ROW, collapsed && 'justify-center px-0', active ? 'text-white' : IDLE)}
        style={active ? { backgroundImage: 'var(--product-grad)' } : undefined}
        title={collapsed ? item.label : undefined}
      >
        <Icon name={item.icon} className="size-[18px] shrink-0" />
        {!collapsed ? (
          <>
            <span className="truncate">{item.label}</span>
            {item.soon ? <SoonTag active={active} /> : null}
          </>
        ) : null}
      </Link>
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(ROW, active ? 'text-[var(--sidebar-fg-strong)]' : IDLE)}
      >
        <Icon
          name={item.icon}
          className={cn('size-[18px] shrink-0', active && 'text-[var(--product-500)]')}
        />
        <span className="flex-1 truncate text-left">{item.label}</span>
        <ChevronDown
          className={cn(
            'size-3.5 shrink-0 text-[var(--sidebar-caption)] transition-transform duration-200',
            open && 'rotate-180',
          )}
          aria-hidden
        />
      </button>

      {open ? (
        <ul className="mt-0.5 mb-1 ml-[18px] space-y-0.5 border-l border-[var(--sidebar-border)] pl-3">
          {item.children!.map((child) => {
            const childActive = pathname === child.href
            return (
              <li key={child.href}>
                <Link
                  href={child.href}
                  onClick={onNavigate}
                  aria-current={childActive ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-2 rounded-[8px] px-2.5 py-1.5 text-sm transition-colors duration-150',
                    childActive
                      ? 'bg-[var(--sidebar-hover)] font-medium text-[var(--sidebar-fg-strong)]'
                      : 'text-[var(--sidebar-fg)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-fg-strong)]',
                  )}
                >
                  <span
                    className={cn(
                      'size-1.5 shrink-0 rounded-full',
                      childActive ? 'bg-[var(--product-500)]' : 'bg-[var(--sidebar-border)]',
                    )}
                    aria-hidden
                  />
                  <span className="truncate">{child.label}</span>
                  {child.soon ? <SoonTag active={childActive} /> : null}
                </Link>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}

/** Minimise the rail to icons, or bring it back. */
function CollapseButton({
  collapsed,
  onClick,
  className,
}: {
  collapsed: boolean
  onClick: () => void
  className?: string
}) {
  const label = collapsed ? 'Expand navigation' : 'Collapse navigation'
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        'grid size-8 shrink-0 place-items-center rounded-[8px] text-[var(--sidebar-caption)] transition-colors hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-fg-strong)]',
        className,
      )}
    >
      {collapsed ? (
        <PanelLeftOpen className="size-[18px]" aria-hidden />
      ) : (
        <PanelLeftClose className="size-[18px]" aria-hidden />
      )}
    </button>
  )
}

/**
 * Marks a destination whose module is not built yet.
 *
 * The link still works and lands on a page that says what is coming and when.
 * Saying so in the rail is kinder than letting someone find out by clicking.
 */
function SoonTag({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        'ml-auto shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold tracking-wide',
        active ? 'bg-white/20 text-white' : 'bg-[var(--sidebar-hover)] text-[var(--sidebar-caption)]',
      )}
    >
      SOON
    </span>
  )
}

function PromoCard() {
  return (
    <div className="shrink-0 px-3 pb-3">
      <div className="relative overflow-hidden rounded-[var(--radius)] bg-[var(--sidebar-bg-deep)] ring-1 ring-[var(--sidebar-border)]">
        <div className="relative z-10 px-3 pt-3">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--sidebar-fg-strong)]">
            <Sparkles className="size-3.5 text-[var(--product-500)]" aria-hidden />
            Make your school smarter
          </p>
          <p className="mt-0.5 text-[11px] leading-4 text-[var(--sidebar-caption)]">
            Attendance, fees and transport in one place.
          </p>
        </div>
        <SchoolScene className="mt-1 h-16 w-full" />
      </div>
    </div>
  )
}

/** Splits the tree into the captioned blocks the rail renders, in order. */
function groupItems(items: NavItem[]): { section: NavSection; items: NavItem[] }[] {
  return NAV_SECTIONS.map((section) => ({
    section,
    // Anything without a section falls into System rather than vanishing, so a
    // newly added module is always reachable.
    items: items.filter((item) => (item.section ?? 'SYSTEM') === section),
  })).filter((group) => group.items.length > 0)
}
