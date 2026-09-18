import Link from 'next/link'
import { requireContext } from '@/server/context'
import { hasFeature } from '@/server/entitlements'
import { FEATURE } from '@/lib/features'
import { learningInsightsOverview } from '@/server/modules/ai-assessment/insights'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState, Notice } from '@/components/ui/states'
import { Metric, MetricRow } from '@/components/ui/metric'
import { Badge } from '@/components/ui/badge'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { buttonVariants } from '@/components/ui/button-variants'

export const metadata = { title: 'Learning Insights' }

function Meter({ value }: { value: number }) {
  const tone =
    value >= 75 ? 'var(--success)' : value >= 50 ? 'var(--warning)' : 'var(--danger)'
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1.5 w-28 overflow-hidden rounded-full bg-[var(--surface-2)]"
        role="img"
        aria-label={`${value} percent`}
      >
        <div className="h-full rounded-full" style={{ width: `${value}%`, background: tone }} />
      </div>
      <span className="text-sm tabular-nums text-[var(--muted)]">{value}%</span>
    </div>
  )
}

export default async function LearningInsightsPage() {
  const ctx = await requireContext('assessments.view')
  const licensed = await hasFeature(ctx.tenant.id, FEATURE.MODULE_AI_ASSIST)

  if (!licensed) {
    return (
      <div>
        <PageHeader title="Learning Insights" />
        <Card>
          <EmptyState title="Not included in this plan" description="Enable AI Assist to unlock insights." />
        </Card>
      </div>
    )
  }

  const data = await learningInsightsOverview(ctx)
  const canGenerate = ctx.can('questionbank.generate')

  return (
    <div className="space-y-6">
      <PageHeader
        title="Learning Insights"
        description="Topic heatmaps and early observations from published marked papers — last 90 days."
        breadcrumbs={[
          { label: 'Assessments', href: '/assessments' },
          { label: 'Intelligence', href: '/assessments/intelligence' },
          { label: 'Insights' },
        ]}
        actions={
          <Link
            href="/assessments/insights/print"
            className={buttonVariants({ variant: 'secondary', size: 'sm' })}
          >
            Print summary
          </Link>
        }
      />

      <Notice tone="info" title="Observations, not diagnoses">
        {data.note}
      </Notice>

      <MetricRow columns={3}>
        <Metric label="Subjects covered" value={String(data.subjects.length)} />
        <Metric label="Topic gaps" value={String(data.schoolGaps.length)} sub="under 60% marks earned" />
        <Metric
          label="May need a check-in"
          value={String(data.needsAttention.length)}
          sub="under 40% on a recent paper"
        />
      </MetricRow>

      {data.heatmap.length === 0 ? (
        <Card>
          <EmptyState
            title="No topic data yet"
            description="Mark and publish papers whose questions are tagged to syllabus topics. Per-assignment analytics also live under Evaluate → Analytics."
          />
          <CardContent>
            <Link href="/assessments" className={buttonVariants({ variant: 'secondary' })}>
              Browse papers
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Weakest topics</CardTitle>
              <p className="mt-1 text-sm text-[var(--muted)]">Across recent published papers</p>
            </CardHeader>
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <TH>Topic</TH>
                    <TH>Chapter</TH>
                    <TH>Marks earned</TH>
                  </tr>
                </THead>
                <TBody>
                  {data.schoolGaps.slice(0, 12).map((topic) => (
                    <TR key={topic.id}>
                      <TD className="text-sm">{topic.name}</TD>
                      <TD className="text-sm text-[var(--muted)]">{topic.chapter}</TD>
                      <TD>
                        {topic.successRate == null ? '—' : <Meter value={topic.successRate} />}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>By chapter</CardTitle>
            </CardHeader>
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <TH>Chapter</TH>
                    <TH align="right">Topics</TH>
                    <TH>Average</TH>
                  </tr>
                </THead>
                <TBody>
                  {data.byChapter.slice(0, 12).map((chapter) => (
                    <TR key={chapter.chapterId || chapter.chapter}>
                      <TD className="text-sm">{chapter.chapter}</TD>
                      <TD align="right" className="text-sm tabular-nums">
                        {chapter.topics.length}
                      </TD>
                      <TD>
                        {chapter.avgRate == null ? '—' : <Meter value={chapter.avgRate} />}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          </Card>
        </div>
      )}

      {data.papersWithGaps.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Papers with topic gaps</CardTitle>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Open analytics, or start a remedial draft from the weak chapters.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.papersWithGaps.map((paper) => (
              <div
                key={paper.assignmentId}
                className="flex flex-col gap-2 border-b border-[var(--border)] pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-medium text-[var(--fg)]">{paper.title}</p>
                  <p className="text-xs text-[var(--muted)]">
                    {paper.className} · {paper.subject} · {paper.marked} marked
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {paper.gaps.slice(0, 4).map((gap) => (
                      <Badge key={gap.id} tone="warning">
                        {gap.name} {gap.successRate != null ? `${gap.successRate}%` : ''}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/assessments/${paper.assessmentId}/evaluate/${paper.assignmentId}/analytics`}
                    className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                  >
                    Analytics
                  </Link>
                  {canGenerate && paper.remedialHref ? (
                    <Link
                      href={paper.remedialHref}
                      className={buttonVariants({ variant: 'primary', size: 'sm' })}
                    >
                      Remedial paper
                    </Link>
                  ) : null}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {data.needsAttention.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>May need academic attention</CardTitle>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Students under 40% on at least one recent published paper. Use for a supportive
              check-in — not ranking or labelling.
            </p>
          </CardHeader>
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Student</TH>
                  <TH align="right">Low papers</TH>
                  <TH>Latest</TH>
                </tr>
              </THead>
              <TBody>
                {data.needsAttention.map((row) => (
                  <TR key={row.studentId}>
                    <TD className="text-sm">
                      {row.name}
                      {row.admissionNo ? (
                        <span className="ml-2 text-xs text-[var(--muted)]">{row.admissionNo}</span>
                      ) : null}
                    </TD>
                    <TD align="right" className="text-sm tabular-nums">
                      {row.lowPapers}/{row.papers}
                    </TD>
                    <TD className="text-sm text-[var(--muted)]">
                      {row.lastPercent}% · {row.lastTitle}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        </Card>
      ) : null}
    </div>
  )
}
