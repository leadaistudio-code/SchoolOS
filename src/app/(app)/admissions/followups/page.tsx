import Link from 'next/link'
import { format } from 'date-fns'
import { requireContext } from '@/server/context'
import { listFollowUps } from '@/server/modules/admissions/service'
import { STAGE_LABELS, type LeadStage } from '@/lib/admissions'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { CompleteFollowUpButton } from '../lead-panels'

export const metadata = { title: 'Follow-ups' }

export default async function FollowUpsPage() {
  const ctx = await requireContext('admissions.manage')
  const rows = await listFollowUps(ctx)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Follow-ups"
        description="Who to contact today, and what is overdue."
        actions={
          <Link href="/admissions" className="text-sm text-[var(--brand-600)] hover:underline">
            Pipeline
          </Link>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>
            Queue · {rows.length} open
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {rows.length === 0 ? (
            <EmptyState title="Nothing due" description="Schedule follow-ups from a lead record." />
          ) : (
            rows.map((row) => (
              <div
                key={row.id}
                className="rounded-[var(--radius-sm)] border border-line p-3 space-y-2"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/admissions/${row.lead.id}`}
                    className="text-sm font-medium text-[var(--brand-600)] hover:underline"
                  >
                    {row.lead.studentName}
                  </Link>
                  <Badge tone={row.overdue ? 'danger' : 'neutral'}>
                    {row.overdue ? 'Overdue' : 'Due'} {format(row.dueOn, 'd MMM')}
                  </Badge>
                  <Badge tone="brand">{row.channel}</Badge>
                  <Badge tone="neutral">
                    {STAGE_LABELS[row.lead.stage as LeadStage] ?? row.lead.stage}
                  </Badge>
                </div>
                <p className="text-xs text-ink-subtle">
                  {row.lead.reference} · {row.lead.parentName} · {row.lead.phone}
                </p>
                {row.note ? <p className="text-sm text-ink-muted">{row.note}</p> : null}
                <CompleteFollowUpButton followUpId={row.id} leadId={row.lead.id} />
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
