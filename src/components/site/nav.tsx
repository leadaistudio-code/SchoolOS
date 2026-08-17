'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronDown, Menu, Minus, Plus, X } from 'lucide-react'
import { Container } from './container'
import { cn } from '@/lib/utils'
import { MEGA_MENUS, type MegaMenu } from '@/content/site/nav'
import { MyCampusViewLogo } from '@/components/brand/logo'

/**
 * The header.
 *
 * Four menus, each opening a panel that is a *layout* rather than a list: a
 * left rail that says what the section is for, then two or three grouped
 * columns. The point is that a director can read the panel rather than scan it.
 *
 * Behaviour worth knowing about:
 *
 *  - Hover opens a menu on pointer devices, but click and keyboard work on
 *    their own, so the header is usable with no pointer at all.
 *  - The open panel closes on Escape, on outside click, and on navigation.
 *  - The bar is transparent over the hero and gains a hairline once the page
 *    scrolls, so the fold is not cut in half by a border that need not be there.
 */
export function SiteNav() {
  const pathname = usePathname()
  const [scrolled, setScrolled] = React.useState(false)
  const [open, setOpen] = React.useState<string | null>(null)
  const [mobile, setMobile] = React.useState(false)
  const headerRef = React.useRef<HTMLElement>(null)
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  // The homepage hero carries its own wordmark and action, so the header stays
  // out of the fold there and arrives once the reader is past it. Everywhere
  // else it behaves as it always has.
  const overHero = pathname === '/'
  const [pastHero, setPastHero] = React.useState(!overHero)

  React.useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 8)
      if (overHero) setPastHero(window.scrollY > window.innerHeight * 0.85)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [overHero])

  // A route change closes everything. Without this the panel survives the
  // navigation it caused.
  React.useEffect(() => {
    setOpen(null)
    setMobile(false)
  }, [pathname])

  // The drawer owns the viewport while it is open.
  React.useEffect(() => {
    if (!mobile) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [mobile])

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(null)
      setMobile(false)
    }
    const onPointerDown = (event: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(event.target as Node)) setOpen(null)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointerDown)
    }
  }, [])

  const hoverOpen = (label: string) => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setOpen(label)
  }

  // A short delay on leaving, so crossing the gap between the trigger and the
  // panel does not close it.
  const hoverClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setOpen(null), 120)
  }

  return (
    <header
      ref={headerRef}
      className={cn(
        // Fixed rather than sticky over the hero: a sticky header occupies
        // its own height in normal flow even when translated away, which
        // opened the fold with a blank white band above the black ground.
        overHero ? 'fixed inset-x-0 top-0' : 'sticky top-0',
        'z-50 transition-[background-color,border-color,box-shadow,opacity,transform] duration-300',
        scrolled || open
          ? 'border-b border-[var(--rule)] bg-white/92 backdrop-blur-md'
          : 'border-b border-transparent bg-transparent',
        overHero && !pastHero && 'pointer-events-none -translate-y-full opacity-0',
      )}
      onMouseLeave={hoverClose}
    >
      <Container wide>
        <div className="flex h-[70px] items-center gap-6">
          <Link href="/" className="shrink-0" aria-label="MyCampusView home">
            {/* The one navbar logo: preloaded, and the only entrance
                animation on the header. */}
            <MyCampusViewLogo size="md" animated priority />
          </Link>

          <nav className="hidden items-center lg:flex" aria-label="Main">
            {MEGA_MENUS.map((menu) => (
              <div
                key={menu.label}
                className="relative"
                onMouseEnter={() => hoverOpen(menu.label)}
              >
                <button
                  type="button"
                  onClick={() => setOpen((current) => (current === menu.label ? null : menu.label))}
                  aria-expanded={open === menu.label}
                  aria-controls={`mega-${menu.label.toLowerCase()}`}
                  aria-haspopup="true"
                  className={cn(
                    'flex items-center gap-1 rounded-lg px-3 py-2 text-[15px] font-medium transition-colors duration-150',
                    open === menu.label
                      ? 'text-[var(--text)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text)]',
                  )}
                >
                  {menu.label}
                  <ChevronDown
                    className={cn(
                      'size-3.5 transition-transform duration-200',
                      open === menu.label && 'rotate-180',
                    )}
                    aria-hidden
                  />
                </button>
              </div>
            ))}

            {/*
              The open panel is rendered here, inside the nav and immediately
              after its triggers, rather than at the end of the header. It is
              positioned against the header either way — but in the DOM this is
              what puts the menu's links next in the tab order, so a keyboard
              user who opens "Product" tabs into it instead of past it to the
              next trigger.
            */}
            {open ? (
              <div className="absolute inset-x-0 top-full">
                <div className="reveal border-b border-[var(--rule)] bg-white shadow-lift">
                  <Container wide>
                    <MegaPanel menu={MEGA_MENUS.find((menu) => menu.label === open)!} />
                  </Container>
                </div>
              </div>
            ) : null}

            <Link
              href="/customers"
              className="rounded-lg px-3 py-2 text-[15px] font-medium text-[var(--text-muted)] transition-colors duration-150 hover:text-[var(--text)]"
            >
              Customers
            </Link>
            <Link
              href="/services"
              className="rounded-lg px-3 py-2 text-[15px] font-medium text-[var(--text-muted)] transition-colors duration-150 hover:text-[var(--text)]"
            >
              Implementation
            </Link>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/sign-in"
              className="hidden rounded-lg px-3 py-2 text-[15px] font-medium text-[var(--text-muted)] transition-colors duration-150 hover:text-[var(--text)] sm:block"
            >
              Sign in
            </Link>
            <Link
              href="/book-demo"
              className="rounded-lg bg-[var(--ink)] px-4 py-2.5 text-[15px] font-medium text-white transition-colors duration-150 hover:bg-[var(--navy-soft)]"
            >
              Book a demo
            </Link>
            <button
              type="button"
              onClick={() => setMobile((current) => !current)}
              className="-mr-2 grid size-10 place-items-center rounded-lg text-[var(--text-muted)] lg:hidden"
              aria-expanded={mobile}
              aria-controls="site-drawer"
              aria-label={mobile ? 'Close menu' : 'Open menu'}
            >
              {mobile ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
            </button>
          </div>
        </div>
      </Container>

      {mobile ? <MobileDrawer onNavigate={() => setMobile(false)} /> : null}
    </header>
  )
}

function MegaPanel({ menu }: { menu: MegaMenu }) {
  return (
    <div
      id={`mega-${menu.label.toLowerCase()}`}
      className="grid gap-10 py-9 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] lg:gap-16"
    >
      <div>
        <p className="eyebrow">{menu.label}</p>
        {menu.lead ? (
          <p className="muted mt-3 max-w-[17rem] text-[15px] leading-[1.55]">{menu.lead}</p>
        ) : null}
        {menu.featured ? (
          <Link
            href={menu.featured.href}
            className="mt-5 block rounded-lg border border-[var(--rule)] bg-[var(--page)] p-4 transition-colors duration-150 hover:border-[var(--rule-strong)]"
          >
            <span className="block text-[15px] font-semibold text-[var(--text)]">
              {menu.featured.label}
            </span>
            {menu.featured.note ? (
              <span className="mt-1 block text-[13px] text-[var(--text-subtle)]">
                {menu.featured.note}
              </span>
            ) : null}
          </Link>
        ) : null}
      </div>

      <div
        className={cn(
          'grid gap-x-10 gap-y-8',
          menu.columns.length >= 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2',
        )}
      >
        {menu.columns.map((column) => (
          <div key={column.heading}>
            <p className="eyebrow">{column.heading}</p>
            <ul className="mt-4 space-y-1">
              {column.links.map((link) => (
                <li key={link.href + link.label}>
                  <Link
                    href={link.href}
                    className="-mx-2 block rounded-lg px-2 py-2 transition-colors duration-150 hover:bg-[var(--page)]"
                  >
                    <span className="block text-[15px] font-medium text-[var(--text)]">
                      {link.label}
                    </span>
                    {link.note ? (
                      <span className="mt-0.5 block text-[13px] leading-[1.45] text-[var(--text-subtle)]">
                        {link.note}
                      </span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * The phone.
 *
 * An accordion, not a shrunk copy of the desktop panel: one section open at a
 * time, full-width targets, and the two actions pinned at the bottom where a
 * thumb reaches them.
 */
function MobileDrawer({ onNavigate }: { onNavigate: () => void }) {
  const [section, setSection] = React.useState<string | null>(MEGA_MENUS[0]?.label ?? null)

  return (
    <div id="site-drawer" className="lg:hidden">
      <div className="flex max-h-[calc(100dvh-70px)] flex-col border-t border-[var(--rule)] bg-white">
        <div className="flex-1 overflow-y-auto overscroll-contain px-[var(--gutter)] py-4">
          {MEGA_MENUS.map((menu) => {
            const expanded = section === menu.label
            return (
              <div key={menu.label} className="border-b border-[var(--rule)]">
                <button
                  type="button"
                  onClick={() => setSection(expanded ? null : menu.label)}
                  aria-expanded={expanded}
                  className="flex w-full items-center justify-between py-4 text-left text-[17px] font-semibold text-[var(--text)]"
                >
                  {menu.label}
                  {expanded ? (
                    <Minus className="size-4 text-[var(--text-subtle)]" aria-hidden />
                  ) : (
                    <Plus className="size-4 text-[var(--text-subtle)]" aria-hidden />
                  )}
                </button>

                {expanded ? (
                  <div className="pb-4">
                    {menu.featured ? (
                      <Link
                        href={menu.featured.href}
                        onClick={onNavigate}
                        className="mb-3 block rounded-lg border border-[var(--rule)] bg-[var(--page)] px-3 py-3 text-[16px] font-medium text-[var(--text)]"
                      >
                        {menu.featured.label}
                      </Link>
                    ) : null}
                    {menu.columns.map((column) => (
                      <div key={column.heading} className="mb-4 last:mb-0">
                        <p className="eyebrow">{column.heading}</p>
                        <ul className="mt-1">
                          {column.links.map((link) => (
                            <li key={link.href + link.label}>
                              <Link
                                href={link.href}
                                onClick={onNavigate}
                                className="block py-2.5 text-[16px] text-[var(--text-muted)]"
                              >
                                {link.label}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            )
          })}

          <ul className="py-2">
            {[
              { label: 'Customers', href: '/customers' },
              { label: 'Implementation & support', href: '/services' },
              { label: 'Contact', href: '/contact' },
              { label: 'Sign in', href: '/sign-in' },
            ].map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={onNavigate}
                  className="block py-3 text-[17px] font-semibold text-[var(--text)]"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="border-t border-[var(--rule)] bg-white px-[var(--gutter)] py-4">
          <Link
            href="/book-demo"
            onClick={onNavigate}
            className="block rounded-lg bg-[var(--ink)] px-4 py-3.5 text-center text-[16px] font-medium text-white"
          >
            Book a demo
          </Link>
        </div>
      </div>
    </div>
  )
}
