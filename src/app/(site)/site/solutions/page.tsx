import type { Metadata } from 'next'
import { Container, Section } from '@/components/site/container'
import { PageIntro, LinkCard } from '@/components/site/page-parts'
import { ClosingCta } from '@/components/site/cta'

export const metadata: Metadata = {
  title: 'Solutions',
  description:
    'How MyCampusView is used by private schools, international schools, preschools and multi-campus groups.',
  alternates: { canonical: '/solutions' },
}

export default function SolutionsPage() {
  return (
    <>
      <PageIntro
        eyebrow="Solutions"
        title="The same system, configured for how you actually run."
        lead="The differences between a preschool and a senior school are real but narrower than most vendors pretend. These pages describe what genuinely changes."
      />

      <Section>
        <Container>
          <div className="grid gap-4 sm:grid-cols-2">
            <LinkCard
              href="/solutions/private-schools"
              meta="K-12"
              title="Private schools"
              body="Fee collection, attendance and parent communication across a full school, usually replacing three or four separate tools."
            />
            <LinkCard
              href="/solutions/international-schools"
              meta="IB, IGCSE, CBSE"
              title="International schools"
              body="Multiple curricula, a mobile parent community, and reporting that has to satisfy a board as well as a principal."
            />
            <LinkCard
              href="/solutions/preschools"
              meta="Early years"
              title="Preschools"
              body="Fewer students, far more parent contact. Attendance, fees and daily communication without the machinery of examinations."
            />
            <LinkCard
              href="/solutions/multi-campus"
              meta="Groups"
              title="Multi-campus groups"
              body="Each campus runs its own day; the group office needs consolidated figures without asking anyone for a spreadsheet."
            />
          </div>
        </Container>
      </Section>

      <ClosingCta />
    </>
  )
}
