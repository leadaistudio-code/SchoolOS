import Link from 'next/link'
import { subDays } from 'date-fns'
import { requireContext } from '@/server/context'
import { studentAttendanceDetail } from '@/server/modules/attendance/service'
import { STATUS_LABEL } from '@/server/modules/attendance/schema'
import { toDateInput } from '@/lib/dates'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { EmptyState } from '@/components/ui/states'
import { Metric, MetricRow } from '@/components/ui/metric'
import { buttonVariants } from '@/components/ui/button-variants'

export const metadata = { title: 'Student attendance' }

function statusTone(status: string): 'success' | 'danger' | 'warning' | 'info' | 'neutral' {
  if (status === 'PRESENT') return 'success'
  if (status === 'ABSENT') return 'danger'
  if (status === 'LATE' || status === 'HALF_DAY') return 'warning'
  if (status === 'LEAVE') return 'info'
  return 'neutral'
}

export default async function StudentAttendanceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireContext('attendance.view')
  const { studentId } = await params
  const sp = await searchParams

  const to = sp.to ?? toDateInput(new Date())
  const from = sp.from ?? toDateInput(subDays(new Date(), 29))

  const detail = await studentAttendanceDetail(ctx, studentId, { from, to })

  const backQs = new URLSearchParams()
  backQs.set('from', from)
  backQs.set('to', to)

  return (
    <div>
      <PageHeader
        title={detail.student.name}
        description={`${detail.student.admissionNo}${
          detail.student.className
            ? ` · ${detail.student.className}${detail.student.sectionName ? ` ${detail.student.sectionName}` : ''}`
            : ''
        } · ${from} to ${to}`}
        actions={
          <Link
            href={`/attendance/reports?${backQs.toString()}`}
            className={buttonVariants({ variant: 'secondary', size: 'sm' })}
          >
            Back to report
          </Link>
        }
      />

      <MetricRow className="mb-4">
        <Metric
          label="Attendance"
          value={detail.percent === null ? 'No data' : `${detail.percent}%`}
          sub={`${detail.days.length} days recorded`}
          emphasis={
            detail.percent !== null && detail.percent < 75 ? 'danger' : undefined
          }
        />
        <Metric label="Present" value={String(detail.counts.present)} />
        <Metric label="Absent" value={String(detail.counts.absent)} />
        <Metric
          label="Late / leave"
          value={String(detail.counts.late + detail.counts.leave)}
          sub={`${detail.counts.late} late · ${detail.counts.leave} leave`}
        />
      </MetricRow>

      <Card className="overflow-hidden">
        {detail.days.length === 0 ? (
          <EmptyState
            title="No attendance in this range"
            description="Try a wider date range, or mark the register for this student first."
          />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Date</TH>
                  <TH>Status</TH>
                  <TH>Class</TH>
                  <TH>Notes</TH>
                </tr>
              </THead>
              <TBody>
                {detail.days.map((day) => (
                  <TR key={day.id}>
                    <TD className="text-sm tnum">{day.onDate}</TD>
                    <TD>
                      <Badge tone={statusTone(day.status)}>
                        {STATUS_LABEL[day.status as keyof typeof STATUS_LABEL] ?? day.status}
                      </Badge>
                      {day.minutesLate ? (
                        <span className="ml-2 text-xs text-ink-subtle">{day.minutesLate} min late</span>
                      ) : null}
                    </TD>
                    <TD className="text-sm text-ink-muted">{day.classLabel ?? '—'}</TD>
                    <TD className="text-sm text-ink-muted">{day.remarks ?? '—'}</TD>
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
