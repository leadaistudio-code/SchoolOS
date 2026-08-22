import Link from 'next/link'
import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import { requireContext } from '@/server/context'
import { scoreSchool } from '@/server/modules/score/service'
import { previousSchoolScore, schoolTrend } from '@/server/modules/score/snapshots'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LinkTabs } from '@/components/ui/tabs'
import { EmptyState, Notice } from '@/components/ui/states'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { buttonVariants } from '@/components/ui/button-variants'
import { formatDay } from '@/lib/dates'
import { BandBar, CoverageNote, MetricAverages, ScoreDial, ScorePill } from './score-ui'
import { ScoreTrendChart } from './trend-chart'
import { CaptureButton } from './capture-button'
import { scoreTabs } from './tabs'

export const metadata = { title: 'Health score' }

/**
 * The school's health card.
 *
 * Built around one question a principal actually asks — "how are we doing, and
 * where is it going wrong?" — so the page reads top to bottom as: the number,
 * which way it is moving, what it is made of, which classes are dragging, and
 * finally the children who need somebody this week. Anything that did not
 * answer part of that question is not on the page.
 */
export default async function ScorePage() {
  const ctx = await requireContext('score.view')

  const [summary, trend, previous] = await Promise.all([
    scoreSchool(ctx),
    schoolTrend(ctx),
    previousSchoolScore(ctx),
  ])

  const delta =
    summary.score !== null && previous ? Math.round((summary.score - previous.score) * 10) / 10 : null

  return (
    <div>
      <PageHeader
        title="Health score"
        description={
          summary.sessionName
            ? `${summary.sessionName} · ${summary.studentsScored} of ${summary.studentsOnRoll} students scored`
            : 'No current academic session'
        }
        actions={ctx.can('score.manage') ? <CaptureButton /> : null}
      />

      <LinkTabs label="Health score views" className="mb-3" items={scoreTabs('/score', ctx)} />

      {summary.score === null ? (
        <Card>
          <CardContent>
            <EmptyState
              title="Not enough recorded to score the school yet"
              description="The score is built from attendance, results, homework and fees already in the system. Once any of those exist for the current session, it appears here — nothing needs to be entered twice."
              action={
                <Link href="/score/weights" className={buttonVariants({ size: 'sm' })}>
                  See what it measures
                </Link>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)] items-start">
          <div className="space-y-4">
            <Card>
              <CardContent className="space-y-4">
                <ScoreDial
                  score={summary.score}
                  band={summary.band}
                  caption={summary.sessionName ?? undefined}
                />

                {delta !== null && previous ? (
                  <p className="flex items-center justify-center gap-1.5 text-sm text-ink-muted">
                    {delta > 0 ? (
                      <ArrowUp className="size-4 text-success" aria-hidden />
                    ) : delta < 0 ? (
                      <ArrowDown className="size-4 text-[var(--danger)]" aria-hidden />
                    ) : (
                      <Minus className="size-4" aria-hidden />
                    )}
                    <span className="tnum font-medium text-ink">
                      {delta > 0 ? '+' : ''}
                      {delta.toFixed(1)}
                    </span>
                    since {formatDay(previous.capturedOn, 'd MMM')}
                  </p>
                ) : (
                  <p className="text-center text-xs text-ink-subtle">
                    No earlier checkpoint to compare against yet.
                  </p>
                )}

                <div className="border-t border-line pt-3">
                  <CoverageNote coverage={summary.coverage} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>How the school splits</CardTitle>
              </CardHeader>
              <CardContent>
                <BandBar counts={summary.bands} total={summary.studentsOnRoll} />
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Where the school is strong and weak</CardTitle>
              </CardHeader>
              <CardContent>
                <MetricAverages rows={summary.metricAverages} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Score over time</CardTitle>
              </CardHeader>
              <CardContent>
                {trend.length === 0 ? (
                  <p className="py-8 text-center text-sm text-ink-subtle">
                    Nothing recorded yet. The score is worked out live every time this page opens;
                    recording a checkpoint is what makes it possible to see the direction later.
                  </p>
                ) : (
                  <ScoreTrendChart
                    points={trend.map((point) => ({
                      label: formatDay(point.capturedOn, 'd MMM'),
                      score: Math.round(point.score * 10) / 10,
                    }))}
                  />
                )}
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader>
                <CardTitle>Every class</CardTitle>
                <Link
                  href="/score/students"
                  className="text-xs text-ink-muted hover:text-ink hover:underline"
                >
                  See every student
                </Link>
              </CardHeader>

              {summary.sections.length === 0 ? (
                <EmptyState title="No sections with students in them yet" />
              ) : (
                <TableWrap>
                  <Table>
                    <THead>
                      <tr>
                        <TH>Class</TH>
                        <TH align="right">Students</TH>
                        <TH>Score</TH>
                        <TH>Spread</TH>
                      </tr>
                    </THead>
                    <TBody>
                      {summary.sections.map((section) => (
                        <TR key={section.id}>
                          <TD>
                            <Link
                              href={`/score/students?sectionId=${section.id}`}
                              className="font-medium text-ink hover:underline"
                            >
                              {section.name}
                            </Link>
                          </TD>
                          <TD align="right" className="tnum">
                            {section.counted === section.size
                              ? section.size
                              : `${section.counted} of ${section.size}`}
                          </TD>
                          <TD>
                            <ScorePill score={section.score} band={section.band} />
                          </TD>
                          <TD className="min-w-40">
                            <BandBar counts={section.bands} total={section.size} />
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </TableWrap>
              )}
            </Card>

            {summary.needsAttention.length > 0 ? (
              <Card className="overflow-hidden">
                <CardHeader>
                  <CardTitle>Needs attention</CardTitle>
                </CardHeader>
                <div className="px-4 pt-3">
                  <Notice tone="info">
                    The lowest scores on the roll. A low score is a prompt to look at the record, not
                    a judgement on the child — open one and every figure behind it is shown.
                  </Notice>
                </div>
                <TableWrap className="mt-3">
                  <Table>
                    <THead>
                      <tr>
                        <TH>Student</TH>
                        <TH>Class</TH>
                        <TH>Score</TH>
                        <TH>Weakest area</TH>
                      </tr>
                    </THead>
                    <TBody>
                      {summary.needsAttention.map((student) => {
                        const weakest = student.composed.parts
                          .filter((p) => p.score !== null)
                          .sort((a, b) => a.score! - b.score!)[0]

                        return (
                          <TR key={student.studentId}>
                            <TD>
                              <Link
                                href={`/students/${student.studentId}`}
                                className="font-medium text-ink hover:underline"
                              >
                                {student.firstName} {student.lastName}
                              </Link>
                              <span className="block text-xs text-ink-subtle">
                                {student.admissionNo}
                              </span>
                            </TD>
                            <TD>
                              {student.className} {student.sectionName}
                            </TD>
                            <TD>
                              <ScorePill score={student.composed.score} band={student.composed.band} />
                            </TD>
                            <TD>
                              {weakest ? (
                                <>
                                  <span className="text-ink">{weakest.label}</span>
                                  <span className="block text-xs text-ink-subtle">
                                    {weakest.detail}
                                  </span>
                                </>
                              ) : (
                                '—'
                              )}
                            </TD>
                          </TR>
                        )
                      })}
                    </TBody>
                  </Table>
                </TableWrap>
              </Card>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
