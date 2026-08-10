import type { Metadata } from 'next'
import { PageIntro } from '@/components/site/page-parts'
import { Modules } from '@/components/site/home/modules'
import { ClosingCta } from '@/components/site/cta'

export const metadata: Metadata = {
  title: 'Features',
  description:
    'Everything in SchoolOS today, grouped by the part of the school that uses it — with an honest list of what is still being built.',
  alternates: { canonical: '/features' },
}

export default function FeaturesPage() {
  return (
    <>
      <PageIntro
        eyebrow="Features"
        title="What is in the product today."
        lead="Listed by the part of the school that uses it rather than by software category, and limited to what is built. What is not built yet is named at the bottom of the page."
      />
      <Modules />
      <ClosingCta />
    </>
  )
}
