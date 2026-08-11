import * as React from 'react'
import { Container, Section } from '../container'
import { SectionHeader, StatusBadge, TextLink } from '../ui'
import { INTEGRATION_GROUPS, INTEGRATION_STATUS_NOTE } from '@/content/site/integrations'

/**
 * Integrations.
 *
 * The usual treatment is a grid of vendor logos, which implies a signed
 * integration with each. SchoolOS reaches the outside world through provider
 * interfaces, and for messaging and payments the vendor account is the
 * school's own, connected during implementation — so the honest unit here is a
 * capability with a status, not a logo.
 *
 * Three statuses, and the legend is on the page rather than in a tooltip.
 */
export function Integrations() {
  return (
    <Section>
      <Container wide>
        <SectionHeader
          split
          eyebrow="Integrations"
          title="Connected to the things a school already uses."
          lead="Messaging and payments run through your own accounts rather than ours, so the sender is your school and the money lands in your bank. Below is what is live, what is connected during setup, and what is not built."
          action={<TextLink href="/integrations">Integration details</TextLink>}
        />

        <div className="mt-12 grid gap-x-12 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
          {INTEGRATION_GROUPS.map((group) => (
            <div key={group.heading}>
              <h3 className="text-[16px] font-semibold text-[var(--text)]">{group.heading}</h3>
              <p className="muted mt-2 text-[14px] leading-[1.55]">{group.lead}</p>

              <ul className="mt-5 space-y-4">
                {group.items.map((item) => (
                  <li key={item.name} className="border-t border-[var(--rule)] pt-3.5">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <span className="text-[15px] font-medium text-[var(--text)]">
                        {item.name}
                      </span>
                      <StatusBadge status={item.status} />
                    </div>
                    <p className="muted mt-1.5 text-[14px] leading-[1.5]">{item.blurb}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <dl className="mt-12 grid gap-x-10 gap-y-4 border-t border-[var(--rule)] pt-6 sm:grid-cols-3">
          {(['available', 'ready', 'planned'] as const).map((status) => (
            <div key={status} className="flex gap-3">
              <StatusBadge status={status} className="mt-0.5" />
              <dd className="muted text-[14px] leading-[1.5]">
                {INTEGRATION_STATUS_NOTE[status]}
              </dd>
            </div>
          ))}
        </dl>
      </Container>
    </Section>
  )
}
