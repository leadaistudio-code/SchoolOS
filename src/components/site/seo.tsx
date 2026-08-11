import * as React from 'react'
import { env } from '@/lib/env'
import { MODULE_COUNTS } from '@/content/site/modules'

/**
 * Structured data.
 *
 * Kept to three things Google actually uses for a product like this: who the
 * organisation is, what the software is, and the breadcrumb trail on interior
 * pages. No `AggregateRating` and no `Review` — those need real ratings, and
 * inventing them is both a lie and a manual action waiting to happen.
 *
 * Emitted as a plain script tag rather than through a library: the payload is
 * static, so anything more is a dependency for no benefit.
 */

function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // The payload is authored here, not user input.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  )
}

function origin() {
  return env().APP_URL.replace(/\/$/, '')
}

export function organisationJsonLd() {
  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: 'SchoolOS',
        url: origin(),
        description:
          'SchoolOS is school management software combining a student information system, an admission CRM and school ERP on one platform.',
        areaServed: ['IN', 'AE', 'SG'],
        knowsAbout: [
          'School management software',
          'Student information system',
          'School ERP',
          'Admission CRM for schools',
        ],
      }}
    />
  )
}

export function softwareJsonLd() {
  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: 'SchoolOS',
        applicationCategory: 'BusinessApplication',
        applicationSubCategory: 'School Management Software',
        operatingSystem: 'Web browser',
        url: origin(),
        description: `School management software for private schools, international schools, preschools and multi-campus groups. ${MODULE_COUNTS.available} modules on one database, covering admissions, student records, academics, examinations, fees, staff, communication and transport.`,
        // No offers block: pricing is not published, and a fabricated price is
        // worse than an absent one.
      }}
    />
  )
}

/** Breadcrumbs for an interior page. `trail` excludes the home link. */
export function breadcrumbJsonLd(trail: { name: string; path: string }[]) {
  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: origin() },
          ...trail.map((item, index) => ({
            '@type': 'ListItem',
            position: index + 2,
            name: item.name,
            item: `${origin()}${item.path}`,
          })),
        ],
      }}
    />
  )
}

/** A frequently-asked-questions block, for pages that genuinely have one. */
export function faqJsonLd(items: { question: string; answer: string }[]) {
  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: items.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: { '@type': 'Answer', text: item.answer },
        })),
      }}
    />
  )
}
