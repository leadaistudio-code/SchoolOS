import * as React from 'react'
import { GraduationCap, LifeBuoy, Rocket, Search, Settings2, Upload } from 'lucide-react'
import { Container, Section } from '../container'
import { SectionHeader, TextLink } from '../ui'
import { JOURNEY } from '@/content/site/company'

/**
 * Implementation.
 *
 * The objection this answers is never "is the software good" — it is "who is
 * going to move eleven years of student records, and what happens to my office
 * for a month". So the timeline is specific about who is in the room and when,
 * and the weeks are ranges rather than promises.
 *
 * Drawn as a single continuous rule with the steps hung off it: six numbered
 * cards in a grid would say the same thing while implying the steps are
 * unrelated.
 */
/** Keyed by step number, which is stable in a way the titles are not. */
const STAGE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  '01': Search,
  '02': Settings2,
  '03': Upload,
  '04': GraduationCap,
  '05': Rocket,
  '06': LifeBuoy,
}

export function Journey() {
  return (
    <Section>
      <Container wide>
        <SectionHeader
          split
          eyebrow="Implementation"
          title="Getting started with MyCampusView is a term’s work, not a year’s."
          lead="A single-campus school of a thousand students is usually live in about four weeks. Migration is the part that takes the time, and we reconcile the totals with your office before anybody signs in."
          action={<TextLink href="/services">Implementation and support</TextLink>}
        />

        <ol className="mt-14 relative" data-reveal>
          {/* The spine. Sits behind the steps, hidden on the phone where each
              step is already visually attached to the one above it. */}
          <span
            className="absolute left-[13px] top-2 hidden h-[calc(100%-1rem)] w-px bg-[var(--rule)] md:block"
            aria-hidden
          />

          {JOURNEY.map((stage) => {
            const Icon = STAGE_ICONS[stage.step]
            return (
            <li
              key={stage.step}
              className="relative grid gap-x-6 gap-y-2 pb-9 last:pb-0 md:grid-cols-[1.75rem_minmax(0,15rem)_minmax(0,1fr)] md:gap-x-10"
            >
              {/* The marker replaces the bare dot with the glyph for the
                  stage. It keeps the white fill so the spine passing behind it
                  is interrupted rather than crossed out. */}
              <span
                className="mt-0.5 hidden size-7 shrink-0 items-center justify-center rounded-full border border-[var(--rule-strong)] bg-white text-[var(--blue)] md:flex"
                aria-hidden
              >
                {Icon ? <Icon className="size-[15px]" /> : null}
              </span>
              <div>
                <p className="eyebrow">{stage.when}</p>
                <h3 className="mt-1.5 text-[19px] font-semibold text-[var(--text)]">
                  <span className="mr-2 text-[14px] tabular-nums text-[var(--text-subtle)]">
                    {stage.step}
                  </span>
                  {stage.title}
                </h3>
              </div>
              <p className="muted max-w-2xl text-[16px] leading-[1.6]">{stage.body}</p>
            </li>
            )
          })}
        </ol>
      </Container>
    </Section>
  )
}
