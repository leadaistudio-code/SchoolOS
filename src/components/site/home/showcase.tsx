import * as React from 'react'
import { Container, Section } from '../container'
import { DashboardRender } from '../product/dashboard-render'
import { ProductFrame, TextLink } from '../ui'

/**
 * The product, at length.
 *
 * One large view of the administrator's dashboard — the application's own
 * components, rendered live rather than screenshotted, so it is sharp at every
 * width and cannot drift out of date.
 *
 * The annotations are a numbered key beneath the frame rather than labels on
 * pins floating over the interface. Pins look impressive in a screenshot and
 * are unreadable on a phone, where they either cover the thing they point at or
 * get hidden entirely. A key reads at every width, is selectable text, and
 * survives translation.
 */

const KEY: { n: string; label: string; detail: string }[] = [
  {
    n: '01',
    label: 'Head count by month',
    detail:
      'Six months of enrolled strength. A class quietly shrinking is visible here long before it shows up in the fee ledger.',
  },
  {
    n: '02',
    label: 'Attendance against it',
    detail:
      'The line over the columns is the monthly attendance percentage, so a drift is read against the strength that produced it.',
  },
  {
    n: '03',
    label: 'Fee collection',
    detail:
      'Collected, pending and overdue across every invoice raised this year — one figure, not three reports that disagree.',
  },
  {
    n: '04',
    label: 'Today’s register',
    detail:
      'Present, absent, late and on leave as the registers come in during the morning rather than at the end of the day.',
  },
]

export function Showcase() {
  return (
    <Section tone="navy" space="loose">
      <Container wide>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end lg:gap-16">
          <div>
            <p className="eyebrow">Reporting</p>
            <h2 className="display mt-3 text-[clamp(1.9rem,3.6vw,2.85rem)]">
              Six months of your school on one screen.
            </h2>
          </div>
          <div>
            <p className="muted max-w-xl text-[18px] leading-[1.55]">
              The lower half of the dashboard from the top of this page, at full size. No figure on
              it is typed in or carried across from a report — strength, attendance and collection
              are computed from the records as they stand when the page loads.
            </p>
            <TextLink href="/school-erp" onDark className="mt-5">
              What the office does with it
            </TextLink>
          </div>
        </div>

        {/* On navy, the frame's white chrome is what separates the product from
            the section. No glow, no border gradient. */}
        <div className="mt-12">
          <ProductFrame label="SchoolOS — administrator dashboard, reporting panels">
            <DashboardRender view="charts" />
          </ProductFrame>
        </div>

        <ol className="mt-12 grid gap-x-12 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
          {KEY.map((item) => (
            <li key={item.n} className="border-t border-[var(--navy-line)] pt-4">
              <p className="flex items-baseline gap-2.5">
                <span className="text-[13px] tabular-nums text-[#7f8db0]">{item.n}</span>
                <span className="text-[16px] font-semibold text-white">{item.label}</span>
              </p>
              <p className="muted mt-1.5 text-[15px] leading-[1.55]">{item.detail}</p>
            </li>
          ))}
        </ol>

        <p className="subtle mt-10 max-w-3xl text-[14px] leading-[1.6]">
          The figures shown are illustrative sample data for a school of about 1,300 students. They
          are not a customer&rsquo;s numbers, and we will never show you another school&rsquo;s.
        </p>
      </Container>
    </Section>
  )
}
