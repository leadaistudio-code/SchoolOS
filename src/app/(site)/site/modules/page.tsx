import type { Metadata } from 'next'
import Link from 'next/link'
import { Container, Section } from '@/components/site/container'
import { PageIntro } from '@/components/site/page-parts'
import { SectionHeader, StatusBadge } from '@/components/site/ui'
import { ClosingCta } from '@/components/site/cta'
import { breadcrumbJsonLd } from '@/components/site/seo'
import {
  MODULE_CATEGORIES,
  MODULE_COUNTS,
  STATUS_NOTE,
} from '@/content/site/modules'

export const metadata: Metadata = {
  title: 'Modules — everything in SchoolOS, and what is not built yet',
  description:
    'The full SchoolOS module catalogue: admissions, student records, attendance, academics, examinations, fees, communication, transport and administration — each labelled available, in build or planned.',
  alternates: { canonical: '/modules' },
}

/**
 * The catalogue.
 *
 * The page a director sends to their office before a call, so it is a reference
 * rather than a pitch: eight categories, every module, and a status on each. The
 * summary at the top gives the three counts, because the first question anyone
 * asks a young product is how much of it exists.
 */
export default function ModulesPage() {
  return (
    <>
      {breadcrumbJsonLd([{ name: 'Modules', path: '/modules' }])}

      <PageIntro
        eyebrow="Modules"
        title="Everything you need to run a school — and a straight answer on what is missing."
        lead="Eight categories, every module in the product, and a label on each one. Nothing on this page is a roadmap item dressed up as a feature; where something is not built, it says so."
      >
        <dl className="grid max-w-3xl gap-6 sm:grid-cols-3">
          {(
            [
              ['available', MODULE_COUNTS.available, 'Working today'],
              ['in-build', MODULE_COUNTS.inBuild, 'Partly shipped'],
              ['planned', MODULE_COUNTS.planned, 'On the roadmap'],
            ] as const
          ).map(([status, count, label]) => (
            <div key={status} className="border-t border-[var(--rule-strong)] pt-4">
              <dd className="display text-[2.2rem] tabular-nums text-[var(--text)]">{count}</dd>
              <dt className="mt-1 flex flex-wrap items-center gap-2 text-[15px] font-semibold text-[var(--text)]">
                {label}
                <StatusBadge status={status} />
              </dt>
              <p className="muted mt-2 text-[14px] leading-[1.55]">{STATUS_NOTE[status]}</p>
            </div>
          ))}
        </dl>
      </PageIntro>

      {/* A contents list, because this page is long by design. */}
      <div className="border-b border-[var(--rule)] bg-[var(--page)] py-5">
        <Container wide>
          <nav aria-label="Module categories" className="flex flex-wrap gap-x-5 gap-y-2">
            {MODULE_CATEGORIES.map((category) => (
              <a
                key={category.key}
                href={`#${category.key}`}
                className="text-[15px] font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--blue)]"
              >
                {category.label}
              </a>
            ))}
          </nav>
        </Container>
      </div>

      {MODULE_CATEGORIES.map((category, index) => (
        <Section
          key={category.key}
          id={category.key}
          tone={index % 2 === 1 ? 'cream' : 'paper'}
          space="snug"
          className="scroll-mt-24"
        >
          <Container wide>
            <SectionHeader split title={category.label} lead={category.lead} />

            <ul className="mt-10 grid gap-x-12 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
              {category.modules.map((module) => (
                <li key={module.name} className="border-t border-[var(--rule-strong)] pt-4">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <h3 className="text-[16px] font-semibold text-[var(--text)]">
                      {module.href ? (
                        <Link href={module.href} className="hover:text-[var(--blue)]">
                          {module.name}
                        </Link>
                      ) : (
                        module.name
                      )}
                    </h3>
                    {module.status === 'available' ? null : <StatusBadge status={module.status} />}
                  </div>
                  <p className="muted mt-2 text-[15px] leading-[1.55]">{module.blurb}</p>
                </li>
              ))}
            </ul>
          </Container>
        </Section>
      ))}

      <Section tone="page" space="snug">
        <Container wide>
          <div className="grid gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-16">
            <h2 className="text-[22px] font-semibold leading-[1.3] text-[var(--text)]">
              Why we publish the gaps
            </h2>
            <div className="max-w-[var(--measure)] space-y-4 text-[16px] leading-[1.65] text-[var(--text-muted)]">
              <p>
                A school choosing this software will find out what is missing in the first month of
                using it. Finding out now costs us some enquiries and saves both of us an
                implementation that was sold on something that did not exist.
              </p>
              <p>
                If a module you need is marked planned, tell us on the call. Which schools ask for
                what is how the order gets decided, and we will give you a real answer about timing
                rather than a quarter.
              </p>
            </div>
          </div>
        </Container>
      </Section>

      <ClosingCta
        title="Tell us which modules you actually need."
        body="We would rather scope a demonstration around the four modules that matter to your office than walk you through all of them."
      />
    </>
  )
}
