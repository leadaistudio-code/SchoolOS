import Link from 'next/link'
import { format } from 'date-fns'
import { notFound } from 'next/navigation'
import { requireContext } from '@/server/context'
import { getLead } from '@/server/modules/admissions/service'
import { STAGE_LABELS, type LeadStage } from '@/lib/admissions'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  AiAssistPanel,
  CompleteFollowUpButton,
  ConvertLeadForm,
  FollowUpForm,
  StageControls,
} from '../lead-panels'

export const metadata = { title: 'Lead' }

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireContext('admissions.view')
  let lead
  try {
    lead = await getLead(ctx, id)
  } catch {
    notFound()
  }

  const classes = await ctx.db.classLevel.findMany({
    where: { deletedAt: null },
    orderBy: { numeric: 'asc' },
    select: {
      id: true,
      name: true,
      sections: {
        where: { deletedAt: null },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      },
    },
  })

  const openFollowUps = lead.followUps.filter((f) => !f.doneAt)

  return (
    <div className="space-y-6">
      <PageHeader
        title={lead.studentName}
        description={`${lead.reference} · ${lead.parentName} · ${lead.phone}`}
        actions={
          <Link href="/admissions" className="text-sm text-[var(--brand-600)] hover:underline">
            Back to pipeline
          </Link>
        }
      />

      <div className="flex flex-wrap gap-2">
        <Badge tone="brand">{STAGE_LABELS[lead.stage as LeadStage] ?? lead.stage}</Badge>
        {lead.source ? <Badge tone="neutral">{lead.source.replaceAll('_', ' ')}</Badge> : null}
        {lead.classLevel ? <Badge tone="neutral">{lead.classLevel.name}</Badge> : null}
        {lead.converted ? (
          <Link href={`/students/${lead.converted.id}`} className="text-sm text-[var(--brand-600)]">
            Student {lead.converted.admissionNo}
          </Link>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Counsellor assist</CardTitle>
          </CardHeader>
          <CardContent>
            <AiAssistPanel leadId={lead.id} canManage={ctx.can('admissions.manage')} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Stage</CardTitle>
          </CardHeader>
          <CardContent>
            <StageControls
              leadId={lead.id}
              stage={lead.stage}
              canManage={ctx.can('admissions.manage')}
            />
          </CardContent>
        </Card>

        {ctx.can('admissions.manage') ? (
          <Card>
            <CardHeader>
              <CardTitle>Schedule follow-up</CardTitle>
            </CardHeader>
            <CardContent>
              <FollowUpForm leadId={lead.id} />
            </CardContent>
          </Card>
        ) : null}

        {ctx.can('admissions.convert') && lead.stage !== 'ENROLLED' ? (
          <Card>
            <CardHeader>
              <CardTitle>Convert to student</CardTitle>
            </CardHeader>
            <CardContent>
              <ConvertLeadForm leadId={lead.id} classes={classes} />
            </CardContent>
          </Card>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Open follow-ups</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {openFollowUps.length === 0 ? (
            <p className="text-sm text-ink-muted">None scheduled.</p>
          ) : (
            openFollowUps.map((f) => (
              <div key={f.id} className="rounded-[var(--radius-sm)] border border-line p-3">
                <p className="text-sm font-medium text-ink">
                  {format(f.dueOn, 'd MMM yyyy')} · {f.channel}
                </p>
                {f.note ? <p className="text-sm text-ink-muted mt-1">{f.note}</p> : null}
                {ctx.can('admissions.manage') ? (
                  <div className="mt-3">
                    <CompleteFollowUpButton followUpId={f.id} leadId={lead.id} />
                  </div>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {lead.activities.map((a) => (
              <li key={a.id} className="border-t border-line pt-3 first:border-0 first:pt-0">
                <p className="text-xs uppercase tracking-wide text-ink-subtle">
                  {a.type} · {format(a.createdAt, 'd MMM yyyy HH:mm')}
                </p>
                <p className="text-sm text-ink mt-0.5">{a.summary}</p>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {lead.notes ? (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-ink-muted whitespace-pre-wrap">{lead.notes}</p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
