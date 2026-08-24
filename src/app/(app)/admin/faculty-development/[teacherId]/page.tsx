import Link from 'next/link'
import { requireContext } from '@/server/context'
import { ApiException } from '@/server/api/response'
import { listTeacherReadiness } from '@/server/modules/teacher-refresh/service'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { EmptyState, Notice } from '@/components/ui/states'
import { buttonVariants } from '@/components/ui/button-variants'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { OversightActions } from './oversight-actions'

export const metadata = { title: 'Teacher readiness' }

const DATE = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

const TYPE_LABEL: Record<string, string> = {
  WEEKLY: 'Weekly refresh',
  MONTHLY: 'Monthly review',
  PRE_LECTURE: 'Before you teach',
  MANUAL: 'Brush-up',
}

const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  PENDING: { label: 'In progress', tone: 'info' },
  OVERDUE: { label: 'Past window', tone: 'warning' },
  COMPLETED: { label: 'Completed', tone: 'success' },
  EXEMPTED: { label: 'Exempted', tone: 'neutral' },
  SCHEDULED: { label: 'Scheduled', tone: 'neutral' },
}

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

/**
 * One teacher's refreshers, for an oversight role.
 *
 * The reason this screen exists is support, not scrutiny: from here a principal
 * can extend a completion window or record an exemption with a reason, both of
 * which land in the audit log. It shows the same readiness labels the teacher
 * sees — never raw answers — and is reachable only with oversight permissions.
 */
export default async function TeacherReadinessPage({
  params,
}: {
  params: Promise<{ teacherId: string }>
}) {
  const ctx = await requireContext('teacher_refresh.view_department')
  const { teacherId } = await params

  let detail: Awaited<ReturnType<typeof listTeacherReadiness>>
  try {
    detail = await listTeacherReadiness(ctx, teacherId)
  } catch (error) {
    if (error instanceof ApiException) {
      return (
        <div>
          <PageHeader title="Teacher readiness" />
          <Card>
            <EmptyState
              title="Teacher not found"
              description="This teacher may have been removed, or isn’t teaching staff."
              action={
                <Link
                  href="/admin/faculty-development"
                  className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                >
                  Back to Faculty Readiness
                </Link>
              }
            />
          </Card>
        </div>
      )
    }
    throw error
  }

  const canManage = ctx.can('teacher_refresh.manage')

  return (
    <div className="space-y-6">
      <PageHeader
        title={detail.teacher.name}
        description={detail.teacher.department?.trim() || 'Unassigned'}
        breadcrumbs={[
          { label: 'Faculty Readiness', href: '/admin/faculty-development' },
          { label: detail.teacher.name },
        ]}
      />

      <Notice tone="info" title="Internal — for support">
        These results are professional-development information. They are never shown to parents or
        students, and are not used to make employment decisions automatically. Any extension or
        exemption you make here is recorded in the audit log.
      </Notice>

      {detail.assessments.length === 0 ? (
        <Card>
          <EmptyState
            title="No refreshers yet"
            description="Nothing has been assigned to this teacher so far."
          />
        </Card>
      ) : (
        <Card>
          <TableWrap>
            <Table>
              <THead>
                <TR>
                  <TH>Refresher</TH>
                  <TH>Status</TH>
                  <TH align="right">Due</TH>
                  <TH>Readiness</TH>
                  {canManage ? <TH align="right">Actions</TH> : null}
                </TR>
              </THead>
              <TBody>
                {detail.assessments.map((a) => {
                  const status = STATUS[a.status] ?? { label: a.status, tone: 'neutral' as BadgeTone }
                  return (
                    <TR key={a.id}>
                      <TD className="text-ink">
                        {TYPE_LABEL[a.type] ?? 'Refresher'}
                        <span className="text-ink-subtle"> · {a.questionCount} Qs</span>
                      </TD>
                      <TD>
                        <Badge tone={status.tone}>{status.label}</Badge>
                      </TD>
                      <TD align="right">{DATE.format(new Date(a.dueAt))}</TD>
                      <TD>
                        {a.readinessLabel ? (
                          <Badge tone={readinessTone(a.readinessLabel)}>{a.readinessLabel}</Badge>
                        ) : (
                          <span className="text-ink-subtle">—</span>
                        )}
                      </TD>
                      {canManage ? (
                        <TD align="right">
                          <OversightActions assessmentId={a.id} status={a.status} />
                        </TD>
                      ) : null}
                    </TR>
                  )
                })}
              </TBody>
            </Table>
          </TableWrap>
        </Card>
      )}
    </div>
  )
}
