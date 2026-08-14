import Link from 'next/link'
import { requireContext } from '@/server/context'
import { appraisalSummary, listAppraisals, COMPETENCIES } from '@/server/modules/staff/appraisals'
import { teacherOptions } from '@/server/modules/people/service'
import { formatDay } from '@/lib/dates'
import { PageHeader } from '@/components/page-header'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge, humanizeStatus, type BadgeTone } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { Metric, MetricRow } from '@/components/ui/metric'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { StaffTabs } from '../tabs'
import { AppraisalEditor } from '../appraisal-editor'
import { StageFilter, StartAppraisalButton } from './controls'

export const metadata = { title: 'Appraisals' }

const TONE: Record<string, BadgeTone> = {
  DRAFT: 'neutral',
  SELF_REVIEW: 'info',
  MANAGER_REVIEW: 'warning',
  COMPLETED: 'success',
}

/**
 * Every appraisal cycle in one list.
 *
 * Ordered by the end of the review period so the ones that are overdue rise
 * to the top, and filtered by stage because the question a head of school
 * actually asks is "what is sitting with me", not "show me everything".
 */
export default async function AppraisalsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireContext('staff.view')
  const params = await searchParams

  const canAppraise = ctx.can('staff.appraise')
  const [appraisals, summary, staff] = await Promise.all([
    listAppraisals(ctx, { status: params.status }),
    appraisalSummary(ctx),
    canAppraise ? teacherOptions(ctx) : Promise.resolve([]),
  ])

  const people = staff.map((s) => ({
    id: s.id,
    label: `${s.firstName} ${s.lastName} — ${s.employeeCode}`,
  }))

  return (
    <div className="space-y-4">
      <PageHeader
        title="Appraisals"
        description={`${summary.open} in progress · ${summary.completed} completed`}
        breadcrumbs={[{ label: 'Teachers & staff', href: '/staff' }, { label: 'Appraisals' }]}
        actions={canAppraise ? <StartAppraisalButton staff={people} reviewers={people} /> : null}
      />

      <StaffTabs
        active="appraisals"
        ctxCan={{
          payroll: ctx.can('staff.payroll'),
          appraise: canAppraise,
          leave: ctx.can('leave.view'),
        }}
      />

      <MetricRow>
        <Metric
          label="In progress"
          value={String(summary.open)}
          sub={`${summary.draft} not started`}
          emphasis={summary.open > 0 ? 'warning' : undefined}
        />
        <Metric
          label="With the appraisee"
          value={String(summary.awaitingSelf)}
          sub="Awaiting a self-assessment"
        />
        <Metric
          label="With the reviewer"
          value={String(summary.awaitingReviewer)}
          sub="Awaiting an assessment"
        />
        <Metric
          label="Average rating"
          value={summary.averageRating === null ? '—' : `${summary.averageRating}`}
          sub={`across ${summary.ratedCount} completed`}
        />
      </MetricRow>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>All cycles</CardTitle>
          <StageFilter status={params.status ?? ''} />
        </CardHeader>

        {appraisals.length === 0 ? (
          <EmptyState
            title={params.status ? 'Nothing at that stage' : 'No appraisals yet'}
            description={
              canAppraise
                ? 'Open a cycle for a member of staff to score seven competencies, record both sides of the conversation and set goals.'
                : 'Nobody has opened an appraisal cycle yet.'
            }
            action={
              canAppraise && !params.status ? (
                <StartAppraisalButton staff={people} reviewers={people} label="Open the first appraisal" />
              ) : undefined
            }
          />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Staff member</TH>
                  <TH>Cycle</TH>
                  <TH>Period</TH>
                  <TH>Reviewer</TH>
                  <TH align="right">Rating</TH>
                  <TH>Stage</TH>
                  {canAppraise ? <TH align="right">&nbsp;</TH> : null}
                </tr>
              </THead>
              <TBody>
                {appraisals.map((a) => (
                  <TR key={a.id}>
                    <TD>
                      <Link
                        href={`/staff/${a.staff.id}?tab=appraisals`}
                        className="block text-sm text-ink hover:underline"
                      >
                        {a.staff.firstName} {a.staff.lastName}
                      </Link>
                      <span className="block text-xs text-ink-subtle">
                        {a.staff.designation ?? a.staff.employeeCode}
                      </span>
                    </TD>
                    <TD className="text-sm text-ink">{a.cycleName}</TD>
                    <TD className="text-xs tnum text-ink-muted">
                      {formatDay(a.periodFrom)} – {formatDay(a.periodTo)}
                    </TD>
                    <TD className="text-sm text-ink-muted">
                      {a.reviewer ? (
                        `${a.reviewer.firstName} ${a.reviewer.lastName}`
                      ) : (
                        <span className="text-warning">Not assigned</span>
                      )}
                    </TD>
                    <TD align="right" className="text-sm tnum">
                      {a.overallRating === null ? '—' : `${a.overallRating} / 5`}
                    </TD>
                    <TD>
                      <Badge tone={TONE[a.status] ?? 'neutral'}>{humanizeStatus(a.status)}</Badge>
                      {a.outcome ? (
                        <span className="ml-1.5 text-xs text-ink-subtle">
                          {humanizeStatus(a.outcome)}
                        </span>
                      ) : null}
                    </TD>
                    {canAppraise ? (
                      <TD align="right">
                        <AppraisalEditor
                          competencies={[...COMPETENCIES]}
                          trigger={a.status === 'COMPLETED' ? 'View' : 'Review'}
                          appraisal={{
                            id: a.id,
                            status: a.status,
                            selfComment: a.selfComment,
                            reviewerComment: a.reviewerComment,
                            strengths: a.strengths,
                            improvements: a.improvements,
                            goals: a.goals,
                            outcome: a.outcome,
                            incrementMinor: a.incrementMinor,
                            staffName: `${a.staff.firstName} ${a.staff.lastName}`,
                            cycleName: a.cycleName,
                            ratings: a.ratings,
                          }}
                        />
                      </TD>
                    ) : null}
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Card>
    </div>
  )
}
