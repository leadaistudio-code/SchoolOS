import type { Metadata } from 'next'
import { PageIntro, Prose, ProseSection } from '@/components/site/page-parts'
import { ClosingCta } from '@/components/site/cta'

export const metadata: Metadata = {
  title: "MyCampusView for multi-campus school groups",
  description: "Each campus runs independently while the group office sees consolidated figures, with data separated at the database layer.",
  alternates: { canonical: '/solutions/multi-campus' },
}

export default function Page() {
  return (
    <>
      <PageIntro eyebrow="School groups" title="Each campus runs its own day." lead="A group office needs comparable figures across campuses without becoming the place every campus has to send a spreadsheet." />

      <ProseSection>
        <Prose title="Separate by default">
          <p>Each campus is a tenant with its own students, staff, fees and branding. Separation is enforced when data is read, not by convention \u2014 a query from one campus cannot return another\u2019s records, and that is covered by tests.</p>
        </Prose>

        <Prose title="One place to look">
          <p>A platform console sits above the campuses for the group office: which are active, how they are configured, and which modules each has enabled.</p>
        </Prose>

        <Prose title="Standard where it helps">
          <p>Fee heads, grading scales and role definitions can follow the same pattern across campuses without forcing every campus onto the same calendar.</p>
        </Prose>

        <Prose title="Honest about today">
          <p>Consolidated cross-campus analytics are not built yet. The console shows configuration and status; comparing collection across eight campuses in one chart is on the roadmap, not in the product.</p>
        </Prose>
      </ProseSection>

      <ClosingCta />
    </>
  )
}
