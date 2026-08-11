import type { Metadata } from 'next'
import { Hero } from '@/components/site/home/hero'
import { Metrics } from '@/components/site/home/metrics'
import { Platform } from '@/components/site/home/platform'
import { CoreProducts } from '@/components/site/home/core-products'
import { Showcase } from '@/components/site/home/showcase'
import { Modules } from '@/components/site/home/modules'
import { Admissions } from '@/components/site/home/admissions'
import { StudentThread } from '@/components/site/home/student-thread'
import { Operations } from '@/components/site/home/operations'
import { Transport } from '@/components/site/home/transport'
import { Parents } from '@/components/site/home/parents'
import { Integrations } from '@/components/site/home/integrations'
import { SchoolTypes } from '@/components/site/home/school-types'
import { Why } from '@/components/site/home/why'
import { Security } from '@/components/site/home/security'
import { CaseStudies, Testimonials } from '@/components/site/home/stories'
import { Journey } from '@/components/site/home/journey'
import { ClosingCta } from '@/components/site/cta'
import { organisationJsonLd, softwareJsonLd } from '@/components/site/seo'

export const metadata: Metadata = {
  title: 'SchoolOS — school management software, SIS and admission CRM on one platform',
  description:
    'SchoolOS runs admissions, student records, academics, fees, attendance, staff, parent communication and school operations on one database. Built for private schools, international schools, preschools and multi-campus groups.',
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
 *   8  one student record followed through the school
 *   9  a Monday morning in the office
 *  10  transport, the part nobody else does well
 *  11  parents and teachers
 *  12  integrations, with their real status
 *  13  the four kinds of institution
 *  14  what is genuinely different
 *  15  security, ending with what we lack
 *  16  stories and quotations, marked as samples until approved
 *  17  how an implementation runs
 *  18  the ask
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
      <StudentThread />
      <Operations />
      <Transport />
      <Parents />
      <Integrations />
      <SchoolTypes />
      <Why />
      <Security />
      <CaseStudies />
      <Testimonials />
      <Journey />
      <ClosingCta />
    </>
  )
}
