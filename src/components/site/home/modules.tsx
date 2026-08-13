'use client'

import * as React from 'react'
import Link from 'next/link'
import { Container, Section } from '../container'
import { SectionHeader, StatusBadge, TextLink } from '../ui'
import { MODULE_CATEGORIES, MODULE_COUNTS } from '@/content/site/modules'
import { cn } from '@/lib/utils'

/**
 * The module catalogue, on the homepage.
 *
 * Six categories behind tabs rather than thirty identical tiles in a wall. A
 * wall of tiles is how these sections are usually built and it is the least
 * useful arrangement possible: a visitor looking for "does it do fees" has to
 * read every tile to find out.
 *
 * Every module carries its status. Showing "planned" next to a module on our own
 * marketing page costs a little and buys the rest of the page: a director who
 * finds one honest label believes the unlabelled ones.
 *
 * Implemented with real tabs — arrow keys move between them, the panel is
 * labelled by its tab, and only the active tab is in the tab order.
 */
export function Modules() {
  const [active, setActive] = React.useState(MODULE_CATEGORIES[0]!.key)
  const tabRefs = React.useRef<Record<string, HTMLButtonElement | null>>({})

  const category = MODULE_CATEGORIES.find((c) => c.key === active)!

  const onKeyDown = (event: React.KeyboardEvent) => {
    const index = MODULE_CATEGORIES.findIndex((c) => c.key === active)
    const next =
      event.key === 'ArrowRight'
        ? (index + 1) % MODULE_CATEGORIES.length
        : event.key === 'ArrowLeft'
          ? (index - 1 + MODULE_CATEGORIES.length) % MODULE_CATEGORIES.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? MODULE_CATEGORIES.length - 1
              : null

    if (next === null) return
    event.preventDefault()
    const key = MODULE_CATEGORIES[next]!.key
    setActive(key)
    tabRefs.current[key]?.focus()
  }

  return (
    <Section id="modules">
      <Container wide>
        <SectionHeader
          split
          eyebrow="Modules"
          title="Everything you need to run a school."
          lead={`${MODULE_COUNTS.available} modules are working today, ${MODULE_COUNTS.inBuild} are partly there, and ${MODULE_COUNTS.planned} are on the roadmap. Each one below says which it is, because you will find out eventually and it may as well be now.`}
          action={<TextLink href="/modules">See the full catalogue</TextLink>}
        />

        <div className="mt-12">
          <div
            role="tablist"
            aria-label="Module categories"
            onKeyDown={onKeyDown}
            className="-mx-[var(--gutter)] flex gap-1 overflow-x-auto px-[var(--gutter)] pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {MODULE_CATEGORIES.map((item) => {
              const selected = item.key === active
              return (
                <button
                  key={item.key}
                  ref={(node) => {
                    tabRefs.current[item.key] = node
                  }}
                  role="tab"
                  id={`module-tab-${item.key}`}
                  aria-selected={selected}
                  aria-controls={`module-panel-${item.key}`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setActive(item.key)}
                  className={cn(
                    'shrink-0 whitespace-nowrap rounded-lg px-4 py-2.5 text-[15px] font-medium transition-colors duration-150',
                    selected
                      ? 'bg-[var(--ink)] text-white'
                      : 'text-[var(--text-muted)] hover:bg-[var(--page)] hover:text-[var(--text)]',
                  )}
                >
                  {item.label}
                </button>
              )
            })}
          </div>

          <div
            role="tabpanel"
            id={`module-panel-${category.key}`}
            aria-labelledby={`module-tab-${category.key}`}
            tabIndex={0}
            className="mt-8 border-t border-[var(--rule)] pt-8"
          >
            <p className="muted max-w-3xl text-[17px] leading-[1.6]">{category.lead}</p>

            <ul className="mt-8 grid gap-x-10 gap-y-7 sm:grid-cols-2 lg:grid-cols-3" data-reveal data-reveal-stagger>
              {category.modules.map((module) => (
                <li key={module.name} className="border-t border-[var(--rule)] pt-4">
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
                  <p className="muted mt-1.5 text-[14px] leading-[1.55]">{module.blurb}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Container>
    </Section>
  )
}
