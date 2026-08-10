import * as React from 'react'
import { Container, Section } from '../container'
import { Badge } from '@/components/ui/badge'
import { PortraitAvatar } from '@/components/ui/portrait-avatar'
import { BusGlyph } from '@/components/transport/bus-glyph'
import { formatMoney } from '@/lib/utils'

/**
 * One record, followed through the school.
 *
 * This is the section the page is built around. Every school platform claims
 * to be integrated; the claim is only worth anything if you can watch a single
 * child's record appear, unretyped, in five different places — the class list,
 * the register, the fee invoice, the bus route and the report card.
 *
 * So the section does exactly that, with the product's own components and one
 * set of data. It is the argument for a shared database, made by showing it
 * rather than by drawing a diagram of systems flowing into a hub.
 */

const STUDENT = {
  first: 'Aarav',
  last: 'Sharma',
  admissionNo: 'DIS/2026/0184',
  className: 'Class 7',
  section: 'A',
  roll: 12,
}

type Moment = {
  step: string
  title: string
  caption: string
  body: React.ReactNode
}

const MOMENTS: Moment[] = [
  {
    step: 'Admission',
    title: 'The record is created once',
    caption: 'Admissions, February',
    body: (
      <div className="flex items-center gap-3">
        <PortraitAvatar seed="Aarav Sharma" gender="MALE" className="size-11" />
        <div className="min-w-0">
          <p className="truncate text-[15px] font-medium text-[var(--text)]">
            {STUDENT.first} {STUDENT.last}
          </p>
          <p className="text-[13px] text-[var(--text-subtle)] tabular-nums">
            {STUDENT.admissionNo}
          </p>
        </div>
      </div>
    ),
  },
  {
    step: 'Academics',
    title: 'He appears on the class list',
    caption: 'Class 7-A · 38 students',
    body: (
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] text-[var(--text)]">
            {STUDENT.className} · {STUDENT.section}
          </p>
          <p className="text-[13px] text-[var(--text-subtle)]">Roll {STUDENT.roll}</p>
        </div>
        <Badge tone="brand">Enrolled</Badge>
      </div>
    ),
  },
  {
    step: 'Attendance',
    title: 'His teacher marks the register',
    caption: 'This week',
    body: (
      <div>
        <div className="flex gap-1.5">
          {[
            { day: 'M', tone: 'present' },
            { day: 'T', tone: 'present' },
            { day: 'W', tone: 'absent' },
            { day: 'T', tone: 'present' },
            { day: 'F', tone: 'late' },
          ].map((entry, index) => (
            <span key={index} className="flex flex-col items-center gap-1">
              <span className="text-[11px] text-[var(--text-subtle)]">{entry.day}</span>
              <span
                className="grid size-7 place-items-center rounded-md text-[11px] font-semibold"
                style={{
                  background:
                    entry.tone === 'present'
                      ? 'color-mix(in srgb, var(--emerald) 14%, transparent)'
                      : entry.tone === 'absent'
                        ? 'color-mix(in srgb, var(--coral) 16%, transparent)'
                        : 'color-mix(in srgb, var(--amber) 18%, transparent)',
                  color:
                    entry.tone === 'present'
                      ? 'var(--emerald)'
                      : entry.tone === 'absent'
                        ? 'var(--coral)'
                        : 'var(--amber)',
                }}
              >
                {entry.tone === 'present' ? 'P' : entry.tone === 'absent' ? 'A' : 'L'}
              </span>
            </span>
          ))}
        </div>
        <p className="mt-2.5 text-[13px] text-[var(--text-subtle)]">
          Absent on Wednesday. His parents were told that morning.
        </p>
      </div>
    ),
  },
  {
    step: 'Fees',
    title: 'His invoice knows his class',
    caption: 'Term 2 · due 15 September',
    body: (
      <div className="space-y-1.5">
        {[
          ['Tuition — Class 7', 2400000],
          ['Transport — Route 2', 600000],
        ].map(([label, amount]) => (
          <div key={label as string} className="flex items-baseline justify-between gap-3">
            <span className="truncate text-[14px] text-[var(--text-muted)]">{label as string}</span>
            <span className="shrink-0 text-[14px] font-medium tabular-nums text-[var(--text)]">
              {formatMoney(amount as number)}
            </span>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-3 border-t border-[var(--rule)] pt-1.5">
          <span className="text-[14px] font-medium text-[var(--text)]">Balance</span>
          <span className="text-[15px] font-semibold tabular-nums text-[var(--text)]">
            {formatMoney(3000000)}
          </span>
        </div>
      </div>
    ),
  },
  {
    step: 'Transport',
    title: 'The bus knows his stop',
    caption: 'Route 2 · picks up 07:25',
    body: (
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[color-mix(in_srgb,var(--blue)_12%,transparent)] text-[var(--blue)]">
          <BusGlyph className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[15px] text-[var(--text)]">Green Park Market</p>
          <p className="text-[13px] text-[var(--text-subtle)]">Stop 3 · BUS-02 · Vikram Singh</p>
        </div>
      </div>
    ),
  },
  {
    step: 'Examinations',
    title: 'His report card writes itself',
    caption: 'Mid-term, Class 7-A',
    body: (
      <div className="space-y-1.5">
        {[
          ['Mathematics', '86', 'A'],
          ['Science', '79', 'B+'],
          ['English', '91', 'A+'],
        ].map(([subject, marks, grade]) => (
          <div key={subject} className="flex items-baseline justify-between gap-3">
            <span className="truncate text-[14px] text-[var(--text-muted)]">{subject}</span>
            <span className="flex shrink-0 items-baseline gap-2">
              <span className="text-[14px] tabular-nums text-[var(--text)]">{marks}</span>
              <span className="w-7 text-right text-[13px] font-semibold text-[var(--emerald)]">
                {grade}
              </span>
            </span>
          </div>
        ))}
      </div>
    ),
  },
]

export function StudentThread() {
  return (
    <Section tone="navy">
      <Container wide>
        <div className="max-w-2xl">
          <p className="eyebrow">Why one database matters</p>
          <h2 className="display mt-3 text-[clamp(2rem,4.2vw,3.1rem)]">
            Aarav is entered once, in February.
          </h2>
          <p className="muted mt-5 max-w-xl text-[18px] leading-[1.55]">
            Everything after that is the same record: his class list, his register, his fee
            invoice, his bus stop, his report card. Nobody re-types his name, and no two systems
            disagree about which class he is in.
          </p>
        </div>

        {/* The thread. A rail on desktop, a spine on mobile — one continuous
            line rather than six separate cards floating in a grid. */}
        <ol className="relative mt-14 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          <li
            className="pointer-events-none absolute inset-x-0 top-[3.25rem] hidden h-px bg-white/12 xl:block"
            aria-hidden
          />
          {MOMENTS.map((moment, index) => (
            <li key={moment.step} className="relative">
              <div className="flex items-center gap-3">
                <span className="relative z-10 grid size-7 shrink-0 place-items-center rounded-full bg-[var(--indigo-bright)] text-[12px] font-semibold text-white">
                  {index + 1}
                </span>
                <span className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[#8f9dc0]">
                  {moment.step}
                </span>
              </div>

              <h3 className="mt-4 text-[19px] font-semibold text-white">{moment.title}</h3>
              <p className="mt-1 text-[14px] text-[var(--on-dark-muted)]">{moment.caption}</p>

              {/* The record itself, on the product's own surface. */}
              <div className="mt-4 rounded-xl bg-white p-4">{moment.body}</div>
            </li>
          ))}
        </ol>

        <p className="muted mt-12 max-w-2xl text-[17px]">
          When he leaves in Class 12, the same record holds six years of attendance, results, fees
          and documents — without anyone having assembled it.
        </p>
      </Container>
    </Section>
  )
}
