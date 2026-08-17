import * as React from 'react'
import { DatabaseZap, Fingerprint, KeyRound, ShieldCheck, Timer, UserCheck } from 'lucide-react'
import { Container, Section } from '../container'
import { ConnectionGrid } from '../connection-grid'
import { SectionHeader, TextLink } from '../ui'
import { SECURITY_POINTS } from '@/content/site/company'

/**
 * Security.
 *
 * Each point corresponds to something in `docs/SECURITY.md`. If a claim here
 * cannot be traced to that document, it should not be here.
 *
 * This section used to close with a "What we do not have" panel naming the
 * certifications MyCampusView does not hold. It was removed from the homepage
 * on request. Note that the copy above still promises to be "specific rather
 * than reassuring", and `SECURITY_LIMITS` in `content/site/company.ts` is now
 * unreferenced — the /security page is where that disclosure belongs if it is
 * to be made anywhere.
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
      </Container>
    </Section>
  )
}
