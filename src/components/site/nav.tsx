'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronDown, Menu, X } from 'lucide-react'
import { Container } from './container'
import { cn } from '@/lib/utils'

type NavLink = { label: string; href: string; note?: string }
type NavGroup = { label: string; links: NavLink[] }

/**
 * Navigation.
 *
 * Every destination here is a page that exists. Two short menus rather than a
 * mega menu: a school director is choosing whether to keep reading, not
 * browsing a catalogue.
 */
const GROUPS: NavGroup[] = [
  {
    label: 'Product',
    links: [
      { label: 'Overview', href: '/product', note: 'How the pieces fit together' },
      {
        label: 'Student records',
        href: '/student-information-system',
        note: 'Students, parents, classes, results',
      },
      { label: 'School operations', href: '/school-erp', note: 'Fees, staff, communication' },
      { label: 'Transport', href: '/transport', note: 'Routes, buses, live tracking' },
    ],
  },
  {
    label: 'Solutions',
    links: [
      { label: 'Private schools', href: '/solutions/private-schools' },
      { label: 'International schools', href: '/solutions/international-schools' },
      { label: 'Preschools', href: '/solutions/preschools' },
      { label: 'Multi-campus groups', href: '/solutions/multi-campus' },
    ],
  },
]

const FLAT: NavLink[] = [
  { label: 'Features', href: '/features' },
  { label: 'Services', href: '/services' },
  { label: 'About', href: '/about' },
]

export function SiteNav() {
  const pathname = usePathname()
  const [scrolled, setScrolled] = React.useState(false)
  const [open, setOpen] = React.useState<string | null>(null)
  const [mobile, setMobile] = React.useState(false)
  const navRef = React.useRef<HTMLElement>(null)

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  React.useEffect(() => {
    setOpen(null)
    setMobile(false)
  }, [pathname])

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(null)
        setMobile(false)
      }
    }
    const onClick = (event: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(event.target as Node)) setOpen(null)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [])

  return (
    <header
      ref={navRef}
      className={cn(
        'sticky top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-200',
        scrolled
          ? 'border-b border-[var(--rule)] bg-white/85 backdrop-blur-md'
          : 'border-b border-transparent bg-transparent',
      )}
    >
      <Container wide>
        <div className="flex h-[68px] items-center gap-8">
          <Link href="/" className="flex items-center gap-2.5" aria-label="SchoolOS home">
            <Wordmark />
          </Link>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
            {GROUPS.map((group) => (
              <div key={group.label} className="relative">
                <button
                  type="button"
                  onClick={() => setOpen((current) => (current === group.label ? null : group.label))}
                  aria-expanded={open === group.label}
                  className="flex items-center gap-1 rounded-lg px-3 py-2 text-[15px] font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
                >
                  {group.label}
                  <ChevronDown
                    className={cn(
                      'size-3.5 transition-transform duration-200',
                      open === group.label && 'rotate-180',
                    )}
                    aria-hidden
                  />
                </button>

                {open === group.label ? (
                  <div className="absolute left-0 top-full w-[22rem] pt-2">
                    <div className="reveal overflow-hidden rounded-xl border border-[var(--rule)] bg-white p-1.5 shadow-lift">
                      {group.links.map((link) => (
                        <Link
                          key={link.href}
                          href={link.href}
                          className="block rounded-lg px-3 py-2.5 transition-colors hover:bg-[var(--page)]"
                        >
                          <span className="block text-[15px] font-medium text-[var(--text)]">
                            {link.label}
                          </span>
                          {link.note ? (
                            <span className="block text-[13px] text-[var(--text-subtle)]">
                              {link.note}
                            </span>
                          ) : null}
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ))}

            {FLAT.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-lg px-3 py-2 text-[15px] font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/sign-in"
              className="hidden rounded-lg px-3 py-2 text-[15px] font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text)] sm:block"
            >
              Sign in
            </Link>
            <Link
              href="/book-demo"
              className="rounded-lg bg-[var(--ink)] px-4 py-2.5 text-[15px] font-medium text-white transition-colors hover:bg-[var(--navy)]"
            >
              Book a demo
            </Link>
            <button
              type="button"
              onClick={() => setMobile((o) => !o)}
              className="-mr-2 grid size-10 place-items-center rounded-lg text-[var(--text-muted)] lg:hidden"
              aria-expanded={mobile}
              aria-label={mobile ? 'Close menu' : 'Open menu'}
            >
              {mobile ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
            </button>
          </div>
        </div>
      </Container>

      {/* The phone gets a full sheet with the same grouping, not a squeezed
          copy of the desktop bar. */}
      {mobile ? (
        <div className="lg:hidden">
          <div className="max-h-[calc(100dvh-68px)] overflow-y-auto border-t border-[var(--rule)] bg-white px-[var(--gutter)] py-6">
            {GROUPS.map((group) => (
              <div key={group.label} className="mb-6">
                <p className="eyebrow mb-2">{group.label}</p>
                <ul className="space-y-0.5">
                  {group.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="block rounded-lg py-2.5 text-[17px] text-[var(--text)]"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <div className="rule pt-4">
              <ul className="space-y-0.5">
                {[...FLAT, { label: 'Contact', href: '/contact' }, { label: 'Sign in', href: '/sign-in' }].map(
                  (link) => (
                    <li key={link.href}>
                      <Link href={link.href} className="block rounded-lg py-2.5 text-[17px] text-[var(--text)]">
                        {link.label}
                      </Link>
                    </li>
                  ),
                )}
              </ul>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  )
}

/**
 * The wordmark.
 *
 * A square with a rule through it — a register page, and the same shape the
 * application uses for a school without a logo. No graduation cap: every
 * education product on earth uses one.
 */
export function Wordmark({ onDark }: { onDark?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="8" fill={onDark ? '#fff' : 'var(--ink)'} />
        <g stroke={onDark ? 'var(--ink)' : '#fff'} strokeWidth="2" strokeLinecap="round">
          <path d="M9 12h14M9 17h14M9 22h8" opacity="0.9" />
        </g>
        <circle cx="23.5" cy="22" r="2.5" fill={onDark ? 'var(--indigo)' : 'var(--indigo-bright)'} />
      </svg>
      <span
        className={cn(
          'text-[19px] font-semibold tracking-[-0.01em]',
          onDark ? 'text-white' : 'text-[var(--ink)]',
        )}
      >
        SchoolOS
      </span>
    </span>
  )
}
