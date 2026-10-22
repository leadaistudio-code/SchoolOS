import { requireContext } from '@/server/context'
import { duesFilterSchema, duesStudentFilter, listStudentDues } from '@/server/modules/finance/service'
import { parseListQuery } from '@/lib/query'
import { attendanceDate } from '@/lib/dates'
import { PageHeader } from '@/components/page-header'
import { BackButton } from '@/components/back-button'
import { SearchBar } from '@/components/search-bar'
import { Metric } from '@/components/ui/metric'
import { accessibleStudentIds } from '@/server/scope'
import { DuesTable } from './dues-table'
import { DuesFilters } from './dues-filters'

export const metadata = { title: 'Fee dues' }

export default async function DuesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireContext('fees.accounts')
  const params = await searchParams
  const query = parseListQuery(params)
  const parsed = duesFilterSchema.safeParse({
    classLevelId: params.classLevelId || undefined,
    sectionId: params.sectionId || undefined,
    age: params.age || undefined,
    minAmount: params.minAmount || undefined,
  })
  const filter = parsed.success ? parsed.data : {}
  const today = attendanceDate(new Date())
  const week = new Date(today.getTime() + 7 * 86_400_000)
  const allowedStudentIds = await accessibleStudentIds(ctx)
  const baseWhere = {
    balanceMinor: { gt: 0 },
    status: { notIn: ['CANCELLED' as const, 'DRAFT' as const] },
    ...(allowedStudentIds === null ? {} : { studentId: { in: allowedStudentIds } }),
    student: duesStudentFilter(filter, query.q),
  }
  const qualifying = filter.minAmount
    ? await ctx.db.feeInvoice.groupBy({
        by: ['studentId'],
        where: baseWhere,
        _sum: { balanceMinor: true },
        having: { balanceMinor: { _sum: { gte: Math.round(filter.minAmount * 100) } } },
      })
    : null
  const where = qualifying ? { ...baseWhere, studentId: { in: qualifying.map((g) => g.studentId) } } : baseWhere

  const [{ rows, total }, totalDue, overdue, dueWeek, overdueStudents, classes] = await Promise.all([
    listStudentDues(ctx, query, filter),
    ctx.db.feeInvoice.aggregate({ where, _sum: { balanceMinor: true } }),
    ctx.db.feeInvoice.aggregate({ where: { ...where, dueOn: { lt: today } }, _sum: { balanceMinor: true } }),
    ctx.db.feeInvoice.aggregate({ where: { ...where, dueOn: { gte: today, lte: week } }, _sum: { balanceMinor: true } }),
    ctx.db.feeInvoice.groupBy({ by: ['studentId'], where: { ...where, dueOn: { lt: today } } }),
    ctx.db.classLevel.findMany({
      where: { deletedAt: null },
      orderBy: { numeric: 'asc' },
      select: { id: true, name: true, sections: { where: { deletedAt: null }, orderBy: { name: 'asc' }, select: { id: true, name: true } } },
    }),
  ])
  const money = (minor: number | null) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: ctx.tenant.currency, maximumFractionDigits: 0 }).format((minor ?? 0) / 100)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Dues"
        description="Find overdue accounts and take action"
        actions={
          <div className="flex items-center gap-3">
            <a href="/finance/dues/monthly" className="text-sm font-medium text-[var(--brand-600)] hover:underline">
              Month-wise grid
            </a>
            <BackButton fallbackHref="/finance" />
          </div>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Total due" value={money(totalDue._sum.balanceMinor)} />
        <Metric label="Overdue" value={money(overdue._sum.balanceMinor)} emphasis="danger" />
        <Metric label="Due this week" value={money(dueWeek._sum.balanceMinor)} />
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
        toolbar={
          <SearchBar placeholder="Search student name or admission no.">
            <DuesFilters classes={classes} />
          </SearchBar>
        }
      />
    </div>
  )
}
