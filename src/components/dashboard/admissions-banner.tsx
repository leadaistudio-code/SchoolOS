import * as React from 'react'
import { AdmissionsScene } from '@/components/illustrations/school-scene'
import { formatNumber } from '@/lib/utils'

/**
 * Admissions this week.
 *
 * No call to action: the enquiry pipeline is not built yet, and a button that
 * goes nowhere useful is worse than none. The figure is real and the card
 * earns its place by carrying it; the CTA arrives with the module.
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
      </div>

      <AdmissionsScene className="absolute -bottom-2 right-1 h-28 w-28 opacity-90" />
    </section>
  )
}
