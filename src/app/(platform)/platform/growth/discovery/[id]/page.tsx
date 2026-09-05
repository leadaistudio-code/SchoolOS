import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { requirePlatformContext } from '@/server/context'
import { getDiscoveryCandidate } from '@/server/modules/platform/growth/discovery/service'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { opportunityLabel, SCHOOL_STATUS_LABELS, type SchoolDiscoveryStatus } from '@/lib/lead-discovery'
import { CandidateActions } from '../discovery-controls'

export const metadata = { title: 'Discovery detail' }

export default async function DiscoveryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const ctx = await requirePlatformContext('platform.crm')
  const { id } = await params
  const row = await getDiscoveryCandidate(ctx, id)
  if (!row) notFound()

  const canEdit = ctx.user.permissions.has('platform.crm_edit')
  const canCreate = ctx.user.permissions.has('platform.crm_create')

  return (
    <div className="space-y-4 max-w-4xl">
      <Link
        href="/platform/growth/discovery"
        className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"
      >
        <ChevronLeft className="size-4" aria-hidden />
        AI Lead Discovery
      </Link>

      <PageHeader
        title={row.schoolName}
        description={[row.sector, row.area, row.city, row.state].filter(Boolean).join(' · ') || '—'}
        actions={
          canEdit || canCreate ? (
            <CandidateActions id={row.id} crmSchoolId={row.crmSchoolId} website={row.website} />
          ) : undefined
        }
      />

      <div className="flex flex-wrap gap-2">
        <Badge tone="neutral">
          {row.schoolStatus
            ? SCHOOL_STATUS_LABELS[row.schoolStatus as SchoolDiscoveryStatus] ?? row.schoolStatus
            : 'Status unknown'}
        </Badge>
        <Badge>{row.verificationStatus.replaceAll('_', ' ')}</Badge>
        <Badge>{row.salesPriority}</Badge>
        <Badge tone="info">
          {row.opportunityScore}/100 · {opportunityLabel(row.opportunityScore)}
        </Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Why this lead?</CardTitle>
          </CardHeader>
          <CardContent className="py-3 text-sm text-ink whitespace-pre-wrap">
            {row.whyThisLead || row.discoverySummary || '—'}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Recommended pitch</CardTitle>
          </CardHeader>
          <CardContent className="py-3 text-sm text-ink whitespace-pre-wrap">
            {row.recommendedPitch || '—'}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Opening evidence</CardTitle>
        </CardHeader>
        <CardContent className="py-3 text-sm text-ink whitespace-pre-wrap">
          {row.openingEvidence || '—'}
          {row.academicSession ? (
            <p className="mt-2 text-ink-muted">Session: {row.academicSession}</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contact</CardTitle>
        </CardHeader>
        <CardContent className="py-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <p className="text-ink-muted">Person</p>
            <p>{row.contactPerson || '—'}</p>
          </div>
          <div>
            <p className="text-ink-muted">Designation</p>
            <p>{row.designation || '—'}</p>
          </div>
          <div>
            <p className="text-ink-muted">Phone</p>
            <p>{row.phone || '—'}</p>
          </div>
          <div>
            <p className="text-ink-muted">Email</p>
            <p>{row.email || '—'}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-ink-muted">Website</p>
            <p>{row.website || '—'}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sources</CardTitle>
        </CardHeader>
        <CardContent className="py-2">
          <ul className="divide-y divide-line">
            {row.evidence.map((e) => (
              <li key={e.id} className="py-2.5">
                <a
                  href={e.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-medium text-[var(--brand-600)] hover:underline"
                >
                  {e.title || e.sourceName || e.url}
                </a>
                <p className="text-xs text-ink-muted">
                  {e.sourceType} · weight {e.weight}
                </p>
                {e.snippet ? <p className="mt-1 text-sm text-ink-muted">{e.snippet}</p> : null}
              </li>
            ))}
            {row.evidence.length === 0 ? (
              <li className="py-3 text-sm text-ink-muted">No evidence stored.</li>
            ) : null}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
