import * as React from 'react'
import Link from 'next/link'
import { Container } from './container'
import { Wordmark } from './nav'
import { FOOTER_COLUMNS } from '@/content/site/nav'
import { CONTACT } from '@/content/site/company'
import { MODULE_COUNTS } from '@/content/site/modules'

/**
 * The footer.
 *
 * A sitemap, which is the job a footer actually does: someone who read half
 * the page and wants the one thing it did not cover finds it here. Five link
 * columns, the address, and nothing decorative.
 *
 * Contact details come from the content config and are omitted when unset —
 * a footer that prints a phone number nobody answers is worse than one that
 * prints an email address that works.
 */
export function SiteFooter() {
  return (
    <footer className="on-navy">
      <Container wide>
        <div className="grid gap-12 py-16 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] lg:gap-20">
          <div>
            <Wordmark onDark />
            <p className="muted mt-4 max-w-xs text-[15px] leading-[1.6]">
              One platform for admissions, student records, academics, fees, staff, parent
              communication and school operations — {MODULE_COUNTS.available} modules on one
              database.
            </p>

            <div className="mt-6 space-y-1.5 text-[15px]">
              <a
                href={`mailto:${CONTACT.sales}`}
                className="block text-[var(--on-dark-muted)] transition-colors hover:text-white"
              >
                {CONTACT.sales}
              </a>
              {CONTACT.phone ? (
                <a
                  href={`tel:${CONTACT.phone.replace(/[^+\d]/g, '')}`}
                  className="block text-[var(--on-dark-muted)] transition-colors hover:text-white"
                >
                  {CONTACT.phone}
                </a>
              ) : null}
              {CONTACT.address ? (
                <p className="max-w-xs text-[var(--on-dark-muted)]">{CONTACT.address}</p>
              ) : null}
            </div>

            <Link
              href="/book-demo"
              className="mt-7 inline-flex rounded-lg bg-white px-4 py-2.5 text-[15px] font-medium text-[var(--ink)] transition-colors duration-150 hover:bg-[#e7ebf5]"
            >
              Book a demo
            </Link>
          </div>

          <div className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-5">
            {FOOTER_COLUMNS.map((column) => (
              <nav key={column.heading} aria-label={column.heading}>
                <p className="eyebrow mb-4">{column.heading}</p>
                <ul className="space-y-2.5">
                  {column.links.map((link) => (
                    <li key={link.href + link.label}>
                      <Link
                        href={link.href}
                        className="text-[15px] text-[var(--on-dark-muted)] transition-colors duration-150 hover:text-white"
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

        <div className="flex flex-col gap-3 border-t border-[var(--navy-line)] py-6 text-[14px] text-[var(--on-dark-muted)] sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} SchoolOS. All rights reserved.</p>
          <p>
            School management software for private schools, international schools, preschools and
            multi-campus groups.
          </p>
        </div>
      </Container>
    </footer>
  )
}
