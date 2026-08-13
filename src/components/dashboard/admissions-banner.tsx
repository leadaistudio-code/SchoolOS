import * as React from 'react'
import Link from 'next/link'
import { AdmissionsScene } from '@/components/illustrations/school-scene'
import { formatNumber } from '@/lib/utils'

/**
 * Admissions this week — links into the live pipeline.
 */
export function AdmissionsBanner({
  thisWeek,
  openLeads,
  sessionLabel,
}: {
  thisWeek: number
  openLeads: number
  sessionLabel: string | null
}) {
  return (
    <section
      className="rise-in relative overflow-hidden rounded-[var(--radius-lg)] p-4 text-white"
      style={{ backgroundImage: 'var(--product-grad)' }}
    >
      <div className="relative z-10 max-w-[62%]">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-white/70">
          Admissions{sessionLabel ? ` · ${sessionLabel}` : ''}
        </p>
        <p className="mt-1 text-lg font-semibold leading-tight">
          {thisWeek > 0
            ? `${formatNumber(thisWeek)} new ${thisWeek === 1 ? 'enquiry' : 'enquiries'} this week`
            : 'No new enquiries this week'}
        </p>
        <p className="mt-1 text-sm text-white/80">
          {openLeads > 0
            ? `${formatNumber(openLeads)} still open and waiting on a follow-up.`
            : 'Every enquiry has been converted or closed.'}
        </p>
        <Link
          href="/admissions"
          className="mt-3 inline-flex text-sm font-semibold text-white underline-offset-2 hover:underline"
        >
          Open pipeline
        </Link>
      </div>

      <AdmissionsScene className="absolute -bottom-2 right-1 h-28 w-28 opacity-90" />
    </section>
  )
}
