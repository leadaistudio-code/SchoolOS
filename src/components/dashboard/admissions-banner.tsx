import * as React from 'react'
import { AdmissionsScene } from '@/components/illustrations/school-scene'
import { ColorBanner } from '@/components/dashboard/color-tiles'
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
    <ColorBanner
      tone="admissions"
      eyebrow={`Admissions${sessionLabel ? ` · ${sessionLabel}` : ''}`}
      title={
        thisWeek > 0
          ? `${formatNumber(thisWeek)} new ${thisWeek === 1 ? 'enquiry' : 'enquiries'} this week`
          : 'No new enquiries this week'
      }
      description={
        openLeads > 0
          ? `${formatNumber(openLeads)} still open and waiting on a follow-up.`
          : 'Every enquiry has been converted or closed.'
      }
      href="/admissions"
      cta="Open pipeline"
      media={<AdmissionsScene className="h-28 w-28" />}
    />
  )
}
