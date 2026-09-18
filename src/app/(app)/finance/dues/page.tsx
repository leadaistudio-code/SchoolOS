import { requireContext } from '@/server/context'
import { listStudentDues } from '@/server/modules/finance/service'
import { parseListQuery } from '@/lib/query'
import { attendanceDate } from '@/lib/dates'
import { PageHeader } from '@/components/page-header'
import { Metric } from '@/components/ui/metric'
import { accessibleStudentIds } from '@/server/scope'
import { DuesTable } from './dues-table'

export const metadata = { title: 'Fee dues' }

export default async function DuesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireContext('fees.accounts')
  const params = await searchParams
  const query = parseListQuery(params)
  const today = attendanceDate(new Date())
  const week = new Date(today.getTime() + 7 * 86_400_000)
  const allowedStudentIds = await accessibleStudentIds(ctx)
  const where = {
    balanceMinor: { gt: 0 },
    status: { notIn: ['CANCELLED' as const, 'DRAFT' as const] },
    ...(allowedStudentIds === null ? {} : { studentId: { in: allowedStudentIds } }),
  }
  const [{ rows, total }, totalDue, overdue, dueWeek, overdueStudents] = await Promise.all([
    listStudentDues(ctx, query),
    ctx.db.feeInvoice.aggregate({ where, _sum: { balanceMinor: true } }),
    ctx.db.feeInvoice.aggregate({ where: { ...where, dueOn: { lt: today } }, _sum: { balanceMinor: true } }),
    ctx.db.feeInvoice.aggregate({ where: { ...where, dueOn: { gte: today, lte: week } }, _sum: { balanceMinor: true } }),
    ctx.db.feeInvoice.groupBy({ by: ['studentId'], where: { ...where, dueOn: { lt: today } } }),
  ])

  return (
    <div className="space-y-4">
      <PageHeader title="Dues" description="Find overdue accounts and take action" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Total due" value={new Intl.NumberFormat('en-IN', { style: 'currency', currency: ctx.tenant.currency, maximumFractionDigits: 0 }).format((totalDue._sum.balanceMinor ?? 0) / 100)} />
        <Metric label="Overdue" value={new Intl.NumberFormat('en-IN', { style: 'currency', currency: ctx.tenant.currency, maximumFractionDigits: 0 }).format((overdue._sum.balanceMinor ?? 0) / 100)} emphasis="danger" />
        <Metric label="Due this week" value={new Intl.NumberFormat('en-IN', { style: 'currency', currency: ctx.tenant.currency, maximumFractionDigits: 0 }).format((dueWeek._sum.balanceMinor ?? 0) / 100)} />
        <Metric label="Students overdue" value={String(overdueStudents.length)} />
      </div>
      <DuesTable
        rows={rows}
        total={total}
        page={query.page}
        pageSize={query.pageSize}
        currency={ctx.tenant.currency}
        canCollect={ctx.can('fees.collect')}
        canRemind={ctx.can('fees.reminder')}
        canExport={ctx.can('fees.export')}
      />
    </div>
  )
}
