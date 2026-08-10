import * as React from 'react'
import Link from 'next/link'
import { Container } from './container'
import { Wordmark } from './nav'

const COLUMNS: { heading: string; links: { label: string; href: string }[] }[] = [
  {
    heading: 'Product',
    links: [
      { label: 'Overview', href: '/product' },
      { label: 'Student records', href: '/student-information-system' },
      { label: 'School operations', href: '/school-erp' },
      { label: 'Transport', href: '/transport' },
      { label: 'All features', href: '/features' },
    ],
  },
  {
    heading: 'Solutions',
    links: [
      { label: 'Private schools', href: '/solutions/private-schools' },
      { label: 'International schools', href: '/solutions/international-schools' },
      { label: 'Preschools', href: '/solutions/preschools' },
      { label: 'Multi-campus groups', href: '/solutions/multi-campus' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Services', href: '/services' },
      { label: 'Security', href: '/security' },
      { label: 'Contact', href: '/contact' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '/terms' },
    ],
  },
]

export function SiteFooter() {
  return (
    <footer className="on-navy">
      <Container wide>
        <div className="grid gap-12 py-16 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
          <div>
            <Wordmark onDark />
            <p className="muted mt-4 max-w-xs text-[15px]">
              One system for student records, attendance, fees, examinations, communication and
              transport.
            </p>
            <Link
              href="/book-demo"
              className="mt-6 inline-flex rounded-lg bg-white px-4 py-2.5 text-[15px] font-medium text-[var(--ink)] transition-opacity hover:opacity-90"
            >
              Book a demo
            </Link>
          </div>

          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {COLUMNS.map((column) => (
              <nav key={column.heading} aria-label={column.heading}>
                <p className="eyebrow mb-3">{column.heading}</p>
                <ul className="space-y-2.5">
                  {column.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="text-[15px] text-[var(--on-dark-muted)] transition-colors hover:text-white"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-white/10 py-6 text-[14px] text-[var(--on-dark-muted)] sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} SchoolOS</p>
          <p>Built for schools, preschools and multi-campus institutions.</p>
        </div>
      </Container>
    </footer>
  )
}
