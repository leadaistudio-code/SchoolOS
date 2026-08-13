import type { Metadata } from 'next'
import { Hero } from '@/components/site/home/hero'
import { Metrics } from '@/components/site/home/metrics'
import { Platform } from '@/components/site/home/platform'
import { CoreProducts } from '@/components/site/home/core-products'
import { Showcase } from '@/components/site/home/showcase'
import { Modules } from '@/components/site/home/modules'
import { Admissions } from '@/components/site/home/admissions'
import { Operations } from '@/components/site/home/operations'
import { Parents } from '@/components/site/home/parents'
import { Integrations } from '@/components/site/home/integrations'
import { Security } from '@/components/site/home/security'
import { CaseStudies } from '@/components/site/home/stories'
import { Journey } from '@/components/site/home/journey'
import { ClosingCta } from '@/components/site/cta'
import { organisationJsonLd, softwareJsonLd } from '@/components/site/seo'

export const metadata: Metadata = {
  title: 'MyCampusView — school management software, SIS and admission CRM on one platform',
  description:
    'MyCampusView runs admissions, student records, academics, fees, attendance, staff, parent communication and school operations on one database. Built for private schools, international schools, preschools and multi-campus groups.',
  alternates: { canonical: '/' },
}

/**
 * The homepage.
 *
 * The order is an argument, not a catalogue, and each section has a distinct
 * composition so the page never reads as the same block repeated:
 *
 *   1  the product, at the fold
 *   2  what is actually built, in numbers we can stand behind
 *   3  why one database is the whole point
 *   4  the three products, as substantial panels
 *   5  the dashboard, large, on navy
 *   6  the catalogue, behind category tabs
 *   7  admissions — including what is not built yet
 *   8  a Monday morning in the office
 *   9  parents and teachers
 *  10  integrations, with their real status
 *  11  security, ending with what we lack
 *  12  case studies, marked as samples until approved
 *  13  how an implementation runs
 *  14  the ask
 *
 * The page was cut from eighteen sections to fourteen. The four that went —
 * the student-record walkthrough, transport, the school-type grid and the
 * differentiators — were the ones that restated an argument the sections
 * above them had already made, and the length was costing more attention
 * than the repetition bought. Quotations went with them: sample testimonials
 * read as filler to the kind of buyer this page is for.
 *
 * Structured data is emitted here rather than in the layout: the homepage is
 * the only page that should describe the organisation and the product itself.
 */
export default function HomePage() {
  return (
    <>
      {organisationJsonLd()}
      {softwareJsonLd()}

      <Hero />
      <Metrics />
      <Platform />
      <CoreProducts />
      <Showcase />
      <Modules />
      <Admissions />
      <Operations />
      <Parents />
      <Integrations />
      <Security />
      <CaseStudies />
      <Journey />
      <ClosingCta />
    </>
  )
}
