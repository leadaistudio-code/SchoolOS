import Link from 'next/link'
import { requireContext } from '@/server/context'
import { facultyReadinessOverview } from '@/server/modules/teacher-refresh/analytics'
import { PageHeader } from '@/components/page-header'
import { Card, Section } from '@/components/ui/card'
import { Metric, MetricRow } from '@/components/ui/metric'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { EmptyState, Notice } from '@/components/ui/states'
import { Progress } from '@/components/ui/progress'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'

export const metadata = { title: 'Faculty Knowledge & Readiness' }

const DATE = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' })

/** Readiness label → badge tone. The lowest band stays neutral, never danger. */
function readinessTone(label: string | null): BadgeTone {
  switch (label) {
    case 'Ready to teach':
      return 'success'
    case 'Good':
      return 'info'
    case 'Refresh recommended':
      return 'warning'
    default:
      return 'neutral'
  }
}

/** Completion-rate colour for a department bar. */
function rateTone(rate: number | null): 'brand' | 'success' | 'warning' {
  if (rate == null) return 'brand'
  if (rate >= 85) return 'success'
  if (rate >= 50) return 'brand'
  return 'warning'
}

/**
 * The school's Faculty Knowledge & Readiness dashboard.
 *
 * This is an INTERNAL, supportive view — never a leaderboard. It exists so a
 * principal can see where the faculty could use a hand and offer it, so the copy
 * leads with completion and support rather than scores, there is no "worst
 * teachers" ordering, and nothing here is exposed to parents, students, or any
 * public surface. Individual results are professional-development information and
 * stay behind these oversight permissions. The numbers inform a person; they
 * never drive an employment decision on their own.
 */
export default async function FacultyReadinessPage() {
  const ctx = await requireContext('teacher_refresh.view_school')
  const overview = await facultyReadinessOverview(ctx)
  const { headline, departments, teachers, alerts } = overview

  return (
    <div className="space-y-6">
      <PageHeader
        title="Faculty Knowledge & Readiness"
        description="A supportive view of how the team is keeping their subject knowledge fresh — for offering help, not for ranking"
      />

      {!overview.enabled ? (
        <Notice tone="info" title="The programme is paused">
          Scheduled refreshers are switched off. Turn them on in Settings → Teacher knowledge refresh
          to start building this picture.
        </Notice>
      ) : null}

      <MetricRow columns={3}>
        <Metric label="Teaching staff" value={String(headline.teacherCount)} />
        <Metric
          label="Completion rate"
          value={headline.completionRate == null ? '—' : `${headline.completionRate}%`}
          sub="Across all assigned refreshers"
        />
        <Metric
          label="Up to date"
          value={`${headline.teachersUpToDate}/${headline.teachersWithWork}`}
          sub="Teachers with nothing overdue"
        />
      </MetricRow>

      {alerts.length > 0 ? (
        <Section
          title="Who might appreciate a hand"
          description="Supportive prompts, not a ranking — a reminder, an extension, or an offer of help."
        >
          <div className="space-y-2">
            {alerts.map((a) => (
              <Link
                key={`${a.kind}-${a.teacherId}`}
                href={`/admin/faculty-development/${a.teacherId}`}
                className="block"
              >
                <Notice tone={a.kind === 'OVERDUE' ? 'warning' : 'info'} title={a.teacherName}>
                  {a.message}
                </Notice>
              </Link>
            ))}
          </div>
        </Section>
      ) : null}

      <Section title="By department" description="Completion within each department.">
        {departments.length === 0 ? (
          <Card>
            <EmptyState title="No departments yet" description="Assign teaching staff to see this roll-up." />
          </Card>
        ) : (
          <Card className="p-4 space-y-4">
            {departments.map((d) => (
              <div key={d.department} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-ink">{d.department}</span>
                  <span className="text-ink-subtle">
                    {d.completionRate == null ? '—' : `${d.completionRate}%`}
                    <span className="text-ink-subtle"> · {d.teacherCount} staff</span>
                  </span>
                </div>
                <Progress
                  value={d.completionRate ?? 0}
                  tone={rateTone(d.completionRate)}
                  label={`${d.department} completion`}
                />
              </div>
            ))}
          </Card>
        )}
      </Section>

      <Section
        title="Teaching staff"
        description="Each teacher's progress. Open a name to extend a window or record an exemption."
      >
        {teachers.length === 0 ? (
          <Card>
            <EmptyState title="No teaching staff" description="Add teaching staff to get started." />
          </Card>
        ) : (
          <Card>
            <TableWrap>
              <Table>
                <THead>
                  <TR>
                    <TH>Teacher</TH>
                    <TH>Department</TH>
                    <TH align="right">Completed</TH>
                    <TH align="right">Overdue</TH>
                    <TH>Readiness</TH>
                    <TH align="right">Last active</TH>
                  </TR>
                </THead>
                <TBody>
                  {teachers.map((t) => (
                    <TR key={t.teacherId}>
                      <TD className="text-ink">
                        <Link
                          href={`/admin/faculty-development/${t.teacherId}`}
                          className="hover:underline"
                        >
                          {t.name}
                        </Link>
                      </TD>
                      <TD>{t.department?.trim() || 'Unassigned'}</TD>
                      <TD align="right">
                        {t.completed}
                        <span className="text-ink-subtle">/{t.assigned}</span>
                      </TD>
                      <TD align="right">
                        {t.overdue > 0 ? (
                          <span className="text-warning font-medium">{t.overdue}</span>
                        ) : (
                          <span className="text-ink-subtle">0</span>
                        )}
                      </TD>
                      <TD>
                        {t.readinessLabel ? (
                          <Badge tone={readinessTone(t.readinessLabel)}>{t.readinessLabel}</Badge>
                        ) : (
                          <span className="text-ink-subtle">—</span>
                        )}
                      </TD>
                      <TD align="right">
                        {t.lastActivityAt ? DATE.format(new Date(t.lastActivityAt)) : '—'}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          </Card>
        )}
      </Section>

      <p className="text-xs text-ink-subtle">
        Individual results are internal professional-development information. They are never shown to
        parents or students, and are not used to make employment decisions automatically.
      </p>
    </div>
  )
}
