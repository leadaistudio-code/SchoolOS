import * as React from 'react'
import { Container, Section } from '../container'
import { SectionHeader, TextLink } from '../ui'

/**
 * One platform.
 *
 * The argument this section has to win is not "we have many modules" — every
 * competitor claims that — it is "these are not separate systems". So the
 * visual is a diagram of one record being read by eight functions, drawn as
 * hairlines on a grid rather than as glowing orbs around a logo.
 *
 * Drawn as SVG so it stays sharp, weighs nothing and needs no library. The
 * diagram is `aria-hidden`; the same information is in the list beside it,
 * which is the version a screen reader and a phone both get.
 */

const FUNCTIONS: { label: string; detail: string }[] = [
  { label: 'Admissions', detail: 'An enquiry becomes this record without being retyped.' },
  { label: 'Students', detail: 'The record itself: who they are, and every year they have been here.' },
  { label: 'Academics', detail: 'Class, section, subjects and the timetable they sit in.' },
  { label: 'Attendance', detail: 'Marked against the class, stored against the student.' },
  { label: 'Examinations', detail: 'Marks, results and the report card computed from them.' },
  { label: 'Finance', detail: 'The invoice, what has been paid, and what is outstanding.' },
  { label: 'Communication', detail: 'Notices and messages addressed from these contact details.' },
  { label: 'Transport', detail: 'The route and stop, and the bus the child is on this afternoon.' },
]

export function Platform() {
  return (
    <Section>
      <Container wide>
        <SectionHeader
          split
          eyebrow="One platform"
          title="Everything your school needs. Connected."
          lead="Schools usually buy an SIS, an accounting package and a messaging tool, then spend the year reconciling them. SchoolOS is one system on one database: the student record admissions created is the record fees invoices, the register marks and the report card is built from."
          action={<TextLink href="/product">How the pieces fit together</TextLink>}
        />

        <div className="mt-14 grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,23rem)] lg:gap-16">
          <PlatformDiagram />

          <div>
            <p className="eyebrow">What reads the same record</p>
            <dl className="mt-4 divide-y divide-[var(--rule)]">
              {FUNCTIONS.map((item) => (
                <div key={item.label} className="py-3.5">
                  <dt className="text-[15px] font-semibold text-[var(--text)]">{item.label}</dt>
                  <dd className="muted mt-1 text-[14px] leading-[1.55]">{item.detail}</dd>
                </div>
              ))}
            </dl>
            <p className="subtle mt-5 text-[14px] leading-[1.55]">
              Nothing above is synchronised overnight. There is one row, and these are eight views
              of it.
            </p>
          </div>
        </div>
      </Container>
    </Section>
  )
}

/**
 * The diagram.
 *
 * A centre panel with eight labelled nodes on a grid, joined by orthogonal
 * hairlines — the shape of a wiring diagram rather than a solar system. Hidden
 * below the large breakpoint, where the list above carries the same argument
 * without being squeezed.
 */
function PlatformDiagram() {
  const nodes: { label: string; x: number; y: number; align: 'start' | 'end' }[] = [
    { label: 'Admissions', x: 40, y: 60, align: 'start' },
    { label: 'Students', x: 40, y: 150, align: 'start' },
    { label: 'Academics', x: 40, y: 240, align: 'start' },
    { label: 'Attendance', x: 40, y: 330, align: 'start' },
    { label: 'Examinations', x: 620, y: 60, align: 'end' },
    { label: 'Finance', x: 620, y: 150, align: 'end' },
    { label: 'Communication', x: 620, y: 240, align: 'end' },
    { label: 'Transport', x: 620, y: 330, align: 'end' },
  ]

  return (
    <div className="hidden lg:block" aria-hidden>
      <svg viewBox="0 0 800 400" className="h-auto w-full" role="presentation">
        {/* The centre. A record, not a badge. */}
        <rect
          x="300"
          y="140"
          width="200"
          height="120"
          rx="12"
          fill="var(--navy)"
        />
        <text
          x="400"
          y="185"
          textAnchor="middle"
          fill="#ffffff"
          fontSize="15"
          fontWeight="600"
          letterSpacing="-0.01em"
        >
          SchoolOS
        </text>
        <text x="400" y="208" textAnchor="middle" fill="#9ba7c2" fontSize="12.5">
          One database
        </text>
        <text x="400" y="228" textAnchor="middle" fill="#9ba7c2" fontSize="12.5">
          One student record
        </text>

        {nodes.map((node) => {
          const left = node.align === 'start'
          const boxWidth = 140
          const boxX = node.x
          const centreY = node.y + 18
          // Orthogonal path: out of the node, along a shared column, into the
          // centre panel. Two bends, never a curve that crosses another line.
          const stemX = left ? boxX + boxWidth : boxX
          const gutterX = left ? 255 : 545
          const panelX = left ? 300 : 500

          return (
            <g key={node.label}>
              <path
                d={`M ${stemX} ${centreY} H ${gutterX} V 200 H ${panelX}`}
                fill="none"
                stroke="var(--rule-strong)"
                strokeWidth="1"
              />
              <circle cx={stemX} cy={centreY} r="2.5" fill="var(--blue)" />
              <rect
                x={boxX}
                y={node.y}
                width={boxWidth}
                height="36"
                rx="8"
                fill="#ffffff"
                stroke="var(--rule)"
              />
              <text
                x={left ? boxX + 14 : boxX + boxWidth - 14}
                y={centreY + 5}
                textAnchor={left ? 'start' : 'end'}
                fill="var(--text)"
                fontSize="13.5"
                fontWeight="500"
              >
                {node.label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
