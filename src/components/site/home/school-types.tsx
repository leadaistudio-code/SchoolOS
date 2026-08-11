'use client'

import * as React from 'react'
import { Container, Section } from '../container'
import { SectionHeader, TextLink } from '../ui'
import { SCHOOL_TYPES } from '@/content/site/company'
import { cn } from '@/lib/utils'

/**
 * School types.
 *
 * Four institutions with genuinely different operational problems — a preschool
 * has no examination cycle, a group office has a consolidation problem a single
 * campus does not have. Presented as a vertical list of selectable panels
 * rather than four cards, so each one gets enough room to say something
 * specific instead of a slogan.
 *
 * On the phone the panels stack open, because a tab strip with four labels at
 * 390px is either cropped or unreadably small.
 */
export function SchoolTypes() {
  const [active, setActive] = React.useState(SCHOOL_TYPES[0]!.key)
  const current = SCHOOL_TYPES.find((type) => type.key === active)!

  return (
    <Section tone="cream">
      <Container wide>
        <SectionHeader
          split
          eyebrow="Solutions"
          title="Built for every type of school."
          lead="The platform is the same; what changes is which parts of it you switch on and how the year is shaped. Choose the one that describes you."
        />

        <div className="mt-12 grid gap-8 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-16">
          {/* Desktop: a list that behaves like tabs. Keyboard users get the
              arrow-key behaviour a tablist implies. */}
          <div
            role="tablist"
            aria-label="Types of institution"
            aria-orientation="vertical"
            className="hidden lg:block"
            onKeyDown={(event) => {
              const index = SCHOOL_TYPES.findIndex((type) => type.key === active)
              const next =
                event.key === 'ArrowDown'
                  ? (index + 1) % SCHOOL_TYPES.length
                  : event.key === 'ArrowUp'
                    ? (index - 1 + SCHOOL_TYPES.length) % SCHOOL_TYPES.length
                    : null
              if (next === null) return
              event.preventDefault()
              setActive(SCHOOL_TYPES[next]!.key)
            }}
          >
            {SCHOOL_TYPES.map((type) => {
              const selected = type.key === active
              return (
                <button
                  key={type.key}
                  role="tab"
                  id={`type-tab-${type.key}`}
                  aria-selected={selected}
                  aria-controls={`type-panel-${type.key}`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setActive(type.key)}
                  className={cn(
                    'block w-full border-l-2 py-3.5 pl-5 pr-3 text-left text-[17px] font-medium transition-colors duration-150',
                    selected
                      ? 'border-[var(--ink)] text-[var(--text)]'
                      : 'border-[var(--rule)] text-[var(--text-subtle)] hover:border-[var(--rule-strong)] hover:text-[var(--text-muted)]',
                  )}
                >
                  {type.label}
                </button>
              )
            })}
          </div>

          <div
            role="tabpanel"
            id={`type-panel-${current.key}`}
            aria-labelledby={`type-tab-${current.key}`}
            className="hidden lg:block"
          >
            <h3 className="display text-[clamp(1.5rem,2.4vw,1.9rem)]">{current.label}</h3>
            <p className="muted mt-4 max-w-2xl text-[18px] leading-[1.6]">{current.lead}</p>
            <ul className="mt-8 grid gap-x-10 gap-y-4 sm:grid-cols-2">
              {current.points.map((point) => (
                <li key={point} className="border-t border-[var(--rule-strong)] pt-3.5 text-[15px] leading-[1.55] text-[var(--text-muted)]">
                  {point}
                </li>
              ))}
            </ul>
            <TextLink href={current.href} className="mt-8">
              {current.label} in detail
            </TextLink>
          </div>

          {/* Phone and tablet: everything open, no tab strip to crop. */}
          <div className="space-y-10 lg:hidden">
            {SCHOOL_TYPES.map((type) => (
              <div key={type.key} className="border-t border-[var(--rule-strong)] pt-5">
                <h3 className="text-[20px] font-semibold text-[var(--text)]">{type.label}</h3>
                <p className="muted mt-2.5 text-[16px] leading-[1.6]">{type.lead}</p>
                <ul className="mt-4 space-y-2">
                  {type.points.map((point) => (
                    <li key={point} className="text-[15px] leading-[1.55] text-[var(--text-muted)]">
                      {point}
                    </li>
                  ))}
                </ul>
                <TextLink href={type.href} className="mt-5">
                  {type.label} in detail
                </TextLink>
              </div>
            ))}
          </div>
        </div>
      </Container>
    </Section>
  )
}
