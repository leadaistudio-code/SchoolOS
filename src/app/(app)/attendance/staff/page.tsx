import { format } from 'date-fns'
import { requireContext } from '@/server/context'
import { staffDayRegister } from '@/server/modules/staff-attendance/service'
import { toDateInput } from '@/lib/dates'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { EmptyState } from '@/components/ui/states'
import { StaffAttendanceControls } from './controls'

export const metadata = { title: 'Staff attendance' }

const TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  PRESENT: 'success',
  LATE: 'warning',
  ABSENT: 'danger',
  HALF_DAY: 'warning',
  LEAVE: 'neutral',
  HOLIDAY: 'neutral',
}

export default async function StaffAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ onDate?: string }>
}) {
  const ctx = await requireContext('staff_attendance.view')
  const params = await searchParams
  const today = toDateInput(new Date())
  const onDate = params.onDate ?? today

  const rows = await staffDayRegister(ctx, onDate)
  const marked = rows.filter((r) => r.status).length
  const canManage = ctx.can('staff_attendance.manage')

  return (
    <div>
      <PageHeader
        title="Staff attendance"
        description={`${marked} of ${rows.length} staff marked on ${format(new Date(`${onDate}T00:00:00`), 'd MMMM yyyy')}`}
      />

      <Card className="overflow-hidden">
        <StaffAttendanceControls onDate={onDate} maxDate={today} />

        {rows.length === 0 ? (
          <EmptyState title="No staff records" description="Add staff before marking attendance." />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Staff</TH>
                  <TH>Status</TH>
                  <TH>Check in / out</TH>
                  <TH>Source</TH>
                  {canManage ? (
                    <TH align="right">
                      <span className="sr-only">Correct</span>
                    </TH>
                  ) : null}
                </tr>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={r.staffId}>
                    <TD>
                      <span className="block text-[13.5px] text-ink">{r.name}</span>
                      <span className="block text-[12px] text-ink-subtle">
                        {r.employeeCode}
                        {r.designation ? ` · ${r.designation}` : ''}
                      </span>
                    </TD>
                    <TD>
                      {r.status ? (
                        <Badge tone={TONE[r.status] ?? 'neutral'}>
                          {r.status.toLowerCase().replace('_', ' ')}
                        </Badge>
                      ) : (
                        <span className="text-[13px] text-ink-subtle">Not marked</span>
                      )}
                      {r.overridden ? (
                        <span className="block text-[11.5px] text-ink-subtle mt-0.5">corrected</span>
                      ) : null}
                    </TD>
                    <TD className="text-[13px] text-ink-muted">
                      {r.checkInAt ? format(r.checkInAt, 'HH:mm') : '—'}
                      {r.checkOutAt ? ` – ${format(r.checkOutAt, 'HH:mm')}` : ''}
                    </TD>
                    <TD className="text-[12.5px] text-ink-subtle">
                      {r.source ? r.source.toLowerCase() : '—'}
                      {r.distanceM !== null ? ` · ${r.distanceM}m` : ''}
                    </TD>
                    {canManage ? (
                      <TD align="right">
                        <StaffAttendanceControls
                          onDate={onDate}
                          maxDate={today}
                          override={{ staffId: r.staffId, name: r.name, current: r.status }}
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
