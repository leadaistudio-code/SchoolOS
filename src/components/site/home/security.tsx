import * as React from 'react'
import { DatabaseZap, Fingerprint, KeyRound, ShieldCheck, Timer, UserCheck } from 'lucide-react'
import { Container, Section } from '../container'
import { ConnectionGrid } from '../connection-grid'
import { SectionHeader, TextLink } from '../ui'
import { SECURITY_LIMITS, SECURITY_POINTS } from '@/content/site/company'

/**
 * Security.
 *
 * The competitive move here is unusual and deliberate: the section ends by
 * saying what SchoolOS does *not* have. Every other site in this market puts a
 * row of certification badges here, and a school's IT reviewer knows most of
 * them are decorative. Naming the gaps ourselves is the only claim on the page
 * that cannot be made by someone who is bluffing.
 *
 * Each point corresponds to something in `docs/SECURITY.md`. If a claim here
 * cannot be traced to that document, it should not be here.
 */
/**
 * One glyph per point, keyed by title rather than by index so reordering the
 * content cannot silently reassign them. A point with no entry renders without
 * an icon rather than with a wrong one.
 */
const POINT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  'Separation between schools': DatabaseZap,
  'Sessions that can actually be revoked': Timer,
  'Passwords stored as bcrypt hashes': KeyRound,
  'Brute force made expensive': ShieldCheck,
  'Access follows the role': UserCheck,
  'An audit trail on what matters': Fingerprint,
}

export function Security() {
  return (
    <Section tone="navy" className="relative overflow-hidden">
      <ConnectionGrid variant="dark" density="sparse" />
      <Container wide className="relative">
        <SectionHeader
          split
          eyebrow="Security"
          title="Your school’s data deserves more than a badge on a website."
          lead="Schools hold children’s addresses, medical notes, photographs and transport stops. That is the reason for the architecture below, and the reason we are specific about it rather than reassuring."
          action={
            <TextLink href="/security" onDark>
              The full security architecture
            </TextLink>
          }
        />

        <div
          className="mt-14 grid gap-x-14 gap-y-9 md:grid-cols-2 lg:grid-cols-3"
          data-reveal
          data-reveal-stagger
        >
          {SECURITY_POINTS.map((point) => {
            const Icon = POINT_ICONS[point.title]
            return (
              <div key={point.title} className="border-t border-[var(--navy-line)] pt-5">
                {Icon ? (
                  <span className="icon-tile mb-4">
                    <Icon className="size-[18px]" />
                  </span>
                ) : null}
                <h3 className="text-[16px] font-semibold text-white">{point.title}</h3>
                <p className="muted mt-2.5 text-[15px] leading-[1.6]">{point.body}</p>
              </div>
            )
          })}
        </div>

        <div className="mt-14 rounded-xl border border-[var(--navy-line)] p-6 sm:p-8" data-reveal>
          <h3 className="text-[16px] font-semibold text-white">What we do not have</h3>
          <ul className="mt-4 space-y-3">
            {SECURITY_LIMITS.map((limit) => (
              <li key={limit} className="muted max-w-3xl text-[15px] leading-[1.6]">
                {limit}
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </Section>
  )
}
