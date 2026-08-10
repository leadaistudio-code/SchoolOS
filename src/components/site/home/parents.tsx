import * as React from 'react'
import { Container, Section } from '../container'
import { Badge } from '@/components/ui/badge'
import { PortraitAvatar } from '@/components/ui/portrait-avatar'
import { formatMoney } from '@/lib/utils'

/**
 * The parent side.
 *
 * Deliberately the shortest section on the page. Its job is to make one point
 * — that parents get a different application rather than a filtered version of
 * the staff one — and then get out of the way.
 *
 * Phone-width, because that is the only device a parent will ever open it on.
 */
export function Parents() {
  return (
    <Section tone="cream">
      <Container>
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] lg:gap-20">
          <div>
            <p className="eyebrow">Parents</p>
            <h2 className="display mt-3 text-[clamp(2rem,4vw,2.9rem)]">
              The office stops answering the same three questions.
            </h2>
            <p className="muted mt-5 max-w-lg text-[18px] leading-[1.55]">
              Was she marked present. What is the homework. How much is left to pay. Parents can
              see their own children and nothing else — enforced in the data layer, not by hiding
              a menu.
            </p>

            <ul className="mt-8 grid max-w-lg gap-x-8 gap-y-3 sm:grid-cols-2">
              {[
                'Attendance, day by day',
                'Homework and classwork',
                'Fee balance and receipts',
                'Results and report cards',
                'Notices from the school',
                "Their child's bus, live",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-[16px] text-[var(--text-muted)]">
                  <span
                    className="mt-2 size-1.5 shrink-0 rounded-full bg-[var(--indigo)]"
                    aria-hidden
                  />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* A phone, drawn plainly. No hand holding it, no floating shadow
              at an angle, no notch illustration. */}
          <div className="mx-auto w-full max-w-[19rem]">
            <div className="rounded-[2rem] border border-[var(--rule-strong)] bg-white p-2.5 shadow-lift">
              <div className="overflow-hidden rounded-[1.5rem] bg-[var(--page)]">
                <div className="bg-white px-4 pb-3 pt-5">
                  <p className="text-[13px] text-[var(--text-subtle)]">Monday, 11 August</p>
                  <p className="mt-0.5 text-[19px] font-semibold text-[var(--text)]">
                    Good morning, Meera
                  </p>
                </div>

                <div className="space-y-2.5 p-3">
                  <div className="flex items-center gap-2.5 rounded-xl bg-white p-3">
                    <PortraitAvatar seed="Aarav Sharma" gender="MALE" className="size-10" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium text-[var(--text)]">
                        Aarav Sharma
                      </p>
                      <p className="text-[12px] text-[var(--text-subtle)]">Class 7 · A</p>
                    </div>
                    <Badge tone="success">Present</Badge>
                  </div>

                  <div className="rounded-xl bg-white p-3">
                    <p className="text-[12px] font-semibold uppercase tracking-[0.07em] text-[var(--text-subtle)]">
                      Bus 02 · Route 2
                    </p>
                    <p className="mt-1.5 text-[14px] text-[var(--text)]">
                      Arriving Green Park Market
                    </p>
                    <p className="text-[13px] text-[var(--emerald)]">in about 6 minutes</p>
                  </div>

                  <div className="rounded-xl bg-white p-3">
                    <p className="text-[12px] font-semibold uppercase tracking-[0.07em] text-[var(--text-subtle)]">
                      Fees
                    </p>
                    <div className="mt-1.5 flex items-baseline justify-between">
                      <span className="text-[14px] text-[var(--text-muted)]">Term 2 balance</span>
                      <span className="text-[15px] font-semibold tabular-nums text-[var(--text)]">
                        {formatMoney(3000000)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[12px] text-[var(--text-subtle)]">Due 15 September</p>
                  </div>

                  <div className="rounded-xl bg-white p-3">
                    <p className="text-[12px] font-semibold uppercase tracking-[0.07em] text-[var(--text-subtle)]">
                      Homework
                    </p>
                    <p className="mt-1.5 text-[14px] text-[var(--text)]">
                      Mathematics — exercise 7.2
                    </p>
                    <p className="text-[13px] text-[var(--text-subtle)]">Due tomorrow</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </Section>
  )
}
