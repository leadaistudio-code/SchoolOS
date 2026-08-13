import * as React from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Container, Section } from '../container'
import { AttendanceRender } from '../product/dashboard-render'
import { Widget } from '@/components/dashboard/widget'
import { PortraitAvatar } from '@/components/ui/portrait-avatar'
import { Badge } from '@/components/ui/badge'
import { formatMoney } from '@/lib/utils'

/**
 * The morning.
 *
 * One section instead of the three this would usually become — a dashboard
 * section, an attendance section and a fees section, each with a headline and
 * a screenshot. They are the same section written three times.
 *
 * Framed as a single moment in a working day, the panels stop being a feature
 * list and become one board: what a head teacher sees before the second bell.
 * The panels are the product's own, at deliberately different sizes, because
 * they are not equally important.
 */
export function Operations() {
  return (
    <Section>
      <Container wide>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-start lg:gap-16" data-reveal>
          <div className="lg:sticky lg:top-28">
            <p className="eyebrow">A Monday morning</p>
            <h2 className="display mt-3 text-[clamp(2rem,4vw,2.9rem)]">
              By 9:15 you know who is missing and what is owed.
            </h2>
            <p className="muted mt-5 text-[18px] leading-[1.55]">
              Teachers mark their registers on a phone in the classroom. The office sees the
              total as it fills in, not at the end of the day when someone types it up.
            </p>
            <p className="muted mt-4 text-[18px] leading-[1.55]">
              Fees behave the same way. A payment collected at the counter changes the
              outstanding figure immediately, and the receipt is already numbered.
            </p>

            <Link
              href="/school-erp"
              className="group mt-7 inline-flex items-center gap-1.5 text-[16px] font-medium text-[var(--blue)]"
            >
              How the office runs on it
              <ArrowRight
                className="size-4 transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </Link>
          </div>

          {/* The board. Sizes vary because the panels do not matter equally. */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Widget
                title="Needs attention"
                subtitle="Before the second bell"
                bodyClassName="p-0"
              >
                <ul className="divide-y divide-[var(--border)]">
                  {[
                    { label: 'Registers not submitted', value: '3 classes', urgent: true },
                    { label: 'Invoices past due', value: '22 families', urgent: true },
                    { label: 'Leave requests to approve', value: '4', urgent: false },
                    { label: 'Buses on the road', value: '6 of 6', urgent: false },
                  ].map((row) => (
                    <li key={row.label} className="flex items-center justify-between gap-3 px-4 py-3">
                      <span className="text-[15px] text-ink-muted">{row.label}</span>
                      <span
                        className={
                          row.urgent
                            ? 'text-[15px] font-semibold tabular-nums text-[var(--coral)]'
                            : 'text-[15px] tabular-nums text-ink-subtle'
                        }
                      >
                        {row.value}
                      </span>
                    </li>
                  ))}
                </ul>
              </Widget>
            </div>

            <AttendanceRender />

            <Widget title="Fees collected today" subtitle="6 payments so far" bodyClassName="p-0">
              <ul className="divide-y divide-[var(--border)]">
                {[
                  ['Ishita', 'Verma', 'DIS/2026/0091', 2400000],
                  ['Rohan', 'Mehta', 'DIS/2026/0142', 3000000],
                  ['Ananya', 'Iyer', 'DIS/2026/0007', 1800000],
                  ['Kabir', 'Nair', 'DIS/2026/0233', 2400000],
                ].map(([first, last, admission, amount]) => (
                  <li key={admission as string} className="flex items-center gap-2.5 px-4 py-2.5">
                    <PortraitAvatar
                      seed={`${first} ${last}`}
                      gender={first === 'Rohan' || first === 'Kabir' ? 'MALE' : 'FEMALE'}
                      className="size-8"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] text-ink">
                        {first as string} {last as string}
                      </span>
                      <span className="block truncate text-[12px] text-ink-subtle">
                        {admission as string}
                      </span>
                    </span>
                    <span className="shrink-0 text-[14px] font-medium tabular-nums text-ink">
                      {formatMoney(amount as number)}
                    </span>
                  </li>
                ))}
              </ul>
            </Widget>

            <div className="sm:col-span-2">
              <Widget title="Outstanding" subtitle="Sorted by how long it has been owed" bodyClassName="p-0">
                <ul className="divide-y divide-[var(--border)]">
                  {[
                    ['Class 9-B', '6 families', 62, 480000],
                    ['Class 7-A', '5 families', 41, 360000],
                    ['Class 4-C', '4 families', 33, 240000],
                  ].map(([klass, families, days, amount]) => (
                    <li key={klass as string} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="w-20 shrink-0 text-[14px] font-medium text-ink">
                        {klass as string}
                      </span>
                      <span className="flex-1 text-[13px] text-ink-subtle">{families as string}</span>
                      <Badge tone={(days as number) > 60 ? 'danger' : 'warning'}>
                        {days as number} days
                      </Badge>
                      <span className="w-24 shrink-0 text-right text-[14px] font-medium tabular-nums text-ink">
                        {formatMoney(amount as number)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Widget>
            </div>
          </div>
        </div>
      </Container>
    </Section>
  )
}
