import type { Metadata } from 'next'
import { EditorialHero } from '@/components/site/editorial/hero'
import { EditorialStatement } from '@/components/site/editorial/statement'
import { EditorialFeatures } from '@/components/site/editorial/features'
import { EditorialCapsules } from '@/components/site/editorial/capsules'
import { EditorialProof } from '@/components/site/editorial/proof'
import { EditorialClosing } from '@/components/site/editorial/closing'
import { CurtainBase, CurtainPanel, CurtainStack } from '@/components/site/editorial/curtain'
import { FloatingNav } from '@/components/site/motion/floating-nav'
import { Admissions } from '@/components/site/home/admissions'
import { Parents } from '@/components/site/home/parents'
import { Integrations } from '@/components/site/home/integrations'
import { Security } from '@/components/site/home/security'
import { Journey } from '@/components/site/home/journey'
import { organisationJsonLd, softwareJsonLd } from '@/components/site/seo'

export const metadata: Metadata = {
  title: 'MyCampusView — school management software, SIS and admission CRM on one platform',
  description:
    'MyCampusView runs admissions, student records, academics, fees, attendance, staff, parent communication and school operations on one database. Built for private schools, international schools, preschools and multi-campus groups.',
  alternates: { canonical: '/' },
}

/**
 * The homepage, as a narrative.
 *
 * The argument is unchanged — it is the same fourteen sections' worth of
 * content — but it is now told in six movements that alternate ground, because
 * a page that switches between black and white is read as chapters rather than
 * as a scroll:
 *
 *   1  dark    the promise, with the objects
 *   2  paper   the claim, and the four figures we can stand behind
 *   3  dark    every module that is built, arriving as a field
 *   4  paper   how an implementation actually goes, and everything around it
 *   5  dark    the ask
 *
 * The sections that do not map onto a movement of their own — admissions, the
 * three products, parents, integrations, security, the implementation
 * sequence — keep their content and sit inside movement four, where they are
 * the detail behind the claim rather than a queue of equal-weight panels.
 *
 * The three products used to be a movement of their own, pinned, between the
 * claim and the modules. It is now a plain section standing where the Monday
 * morning board stood: the same board, argued as the product rather than as an
 * hour of the day.
 *
 * Each ground arrives as a curtain over the last: the previous movement holds
 * at the top of the viewport while the next travels over it. Built from sticky
 * positioning rather than pinning, so there is nothing to recalculate on
 * resize and no state that can be left stranded mid-transition.
 */

/**
 * In document order, which is the only order that works: the floating nav
 * marks whichever section is on screen, so a mark listed before the section
 * above it lights up out of sequence and reads as a bug in the page.
 */
const MARKS = [
  { id: 'platform', label: 'Platform' },
  { id: 'modules', label: 'Modules' },
  { id: 'stories', label: 'Stories' },
  { id: 'product', label: 'Product' },
  { id: 'demo', label: 'Demo' },
]

export default function HomePage() {
  return (
    <>
      {organisationJsonLd()}
      {softwareJsonLd()}

      <FloatingNav marks={MARKS} />

      <CurtainStack>
        <CurtainBase>
          <EditorialHero />
        </CurtainBase>

        <CurtainPanel tone="paper">
          <EditorialStatement />
        </CurtainPanel>
      </CurtainStack>

      <CurtainStack>
        <CurtainBase className="h-0" />
        <CurtainPanel tone="black">
          <EditorialCapsules />
        </CurtainPanel>
      </CurtainStack>

      <CurtainPanel tone="paper">
        <EditorialProof />

        {/*
          The detail behind the claim. These keep their existing compositions:
          they are argued in prose and tables, which the editorial register
          would flatten rather than improve, and a director reads them after
          the narrative has done its work.
        */}
        <div className="border-t border-[color-mix(in_srgb,var(--ed-ink)_8%,transparent)]">
          <Admissions />
          <EditorialFeatures />
          <Parents />
          <Integrations />
          <Security />
          <Journey />
        </div>
      </CurtainPanel>

      {/*
        The ask arrives as its own curtain, like the modules do. It has to be
        inside a black CurtainPanel and not merely placed after one: the
        section is marked `on-ed-black`, and that class deliberately sets a
        TRANSPARENT background because it is meant to sit on a ground a curtain
        has already laid down. Standing on its own it took the paper ground
        underneath instead and set white type on it, which left the whole
        closing section — headline, copy and the demonstration list — invisible.
      */}
      <CurtainStack>
        <CurtainBase className="h-0" />
        <CurtainPanel tone="black">
          <EditorialClosing />
        </CurtainPanel>
      </CurtainStack>
    </>
  )
}
