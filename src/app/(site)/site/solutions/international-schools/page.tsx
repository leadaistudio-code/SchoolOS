import type { Metadata } from 'next'
import { PageIntro, Prose, ProseSection } from '@/components/site/page-parts'
import { ClosingCta } from '@/components/site/cta'

export const metadata: Metadata = {
  title: "MyCampusView for international schools",
  description: "Multiple curricula, grading scales, a mobile parent community and board-level reporting on one school system.",
  alternates: { canonical: '/solutions/international-schools' },
}

export default function Page() {
  return (
    <>
      <PageIntro eyebrow="International schools" title="Several curricula, one set of records." lead="An international school usually carries more than one grading system, a parent community spread across time zones, and a board that expects figures rather than assurances." />

      <ProseSection>
        <Prose title="Grading that is not assumed">
          <p>Grading scales are configured per school and attached to an examination, so a percentage, a letter grade and a points value can coexist without anyone maintaining a conversion table by hand.</p>
        </Prose>

        <Prose title="A parent community that is not in the building">
          <p>Parents reach attendance, homework, results, fees and notices from a phone, in their own account, seeing only their own children. Communication that matters stays inside the system and on the student record.</p>
        </Prose>

        <Prose title="Branding that is yours">
          <p>Each school controls its own colours, logo and login page, and can run on its own domain. Mail to families can be sent through the school\u2019s own server, so correspondence arrives from the school\u2019s address.</p>
        </Prose>
      </ProseSection>

      <ClosingCta />
    </>
  )
}
