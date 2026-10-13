import Link from 'next/link'
import { AlertCircle, FileText, Users, Wallet } from 'lucide-react'
import { ACCENT, StatCard } from '@/components/ui/stat-card'
import { requireContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { BackButton } from '@/components/back-button'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/states'
import { formatMoney } from '@/lib/utils'
import {
  classOptions,
  duesGridFilterSchema,
  FY_MONTH_LABELS,
  monthlyDuesGrid,
  type MonthCell,
} from '@/server/modules/finance/dues-grid'

export const metadata = { title: 'Month-wise dues' }

const PAGE_SIZE = 100

function short(minor: number) {
  const r = minor / 100
  return r >= 1_00_000 ? `${(r / 1_00_000).toFixed(1)}L` : r >= 1000 ? `${(r / 1000).toFixed(r >= 10_000 ? 0 : 1)}k` : String(Math.round(r))
}

function Cell({ cell }: { cell: MonthCell }) {
  if (!cell || cell.billedMinor === 0) return <td className="px-1.5 py-1.5 text-center text-xs text-ink-subtle">·</td>
  const paid = cell.balanceMinor <= 0
  const partial = !paid && cell.balanceMinor < cell.billedMinor
  const tone = paid
    ? 'bg-success-bg text-success'
    : cell.overdue
      ? 'bg-danger-bg text-[var(--danger)]'
      : partial
        ? 'bg-warning-bg text-warning'
        : 'bg-surface-2 text-ink-muted'
  return (
    <td className="px-1 py-1 text-center">
      <span
        className={`inline-block min-w-12 rounded px-1.5 py-0.5 text-xs font-medium tnum ${tone}`}
        title={`Billed ₹${(cell.billedMinor / 100).toLocaleString('en-IN')} · Due ₹${(Math.max(0, cell.balanceMinor) / 100).toLocaleString('en-IN')}`}
      >
        {paid ? 'Paid' : short(cell.balanceMinor)}
      </span>
    </td>
  )
}

export default async function MonthlyDuesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireContext('fees.accounts')
  const params = await searchParams
  const filter = duesGridFilterSchema.parse(params)
  const [grid, classes] = await Promise.all([monthlyDuesGrid(ctx, filter), classOptions(ctx)])
  const page = Math.max(1, Number(params.page) || 1)
  const pageRows = grid.rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const pages = Math.max(1, Math.ceil(grid.rows.length / PAGE_SIZE))
  const currency = ctx.tenant.currency
  const qs = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(Object.entries({ ...params, ...patch }).filter((e): e is [string, string] => !!e[1]))
    return next.toString()
  }
  const exportQs = qs({ page: undefined })

  return (
    <div className="space-y-4">
      <PageHeader
        title="Month-wise dues"
        description={`FY ${grid.fyLabel}: what each student owes month by month (April to March).`}
        actions={
          <div className="flex items-center gap-3">
            {ctx.can('fees.export') ? (
              <a href={`/api/v1/finance/dues/monthly/export?${exportQs}`} className="text-sm font-medium text-[var(--brand-600)] hover:underline">
                Export CSV
              </a>
            ) : null}
            <BackButton fallbackHref="/finance/dues" />
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Billed (FY)" value={formatMoney(grid.totals.billedMinor, currency)} icon={FileText} accent={ACCENT.indigo} />
        <StatCard label="Balance due" value={formatMoney(grid.totals.balanceMinor, currency)} icon={Wallet} accent={ACCENT.amber} />
        <StatCard
          label="Overdue"
          value={formatMoney(grid.totals.overdueMinor, currency)}
          icon={AlertCircle}
          accent={ACCENT.rose}
          tone={grid.totals.overdueMinor > 0 ? 'danger' : undefined}
        />
        <StatCard
          label="Defaulters"
          value={String(grid.totals.defaulters)}
          hint={`of ${grid.rows.length} students shown`}
          icon={Users}
          accent={ACCENT.violet}
          href="?filter=defaulters"
        />
      </div>

      <Card className="p-4">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="block text-sm">
            <span className="text-ink-muted">Financial year</span>
            <Select name="fy" defaultValue={String(grid.fyStart)} className="mt-1 w-32">
              {[grid.fyStart + 1, grid.fyStart, grid.fyStart - 1, grid.fyStart - 2].map((y) => (
                <option key={y} value={y}>{y}-{String(y + 1).slice(2)}</option>
              ))}
            </Select>
          </label>
          <label className="block text-sm">
            <span className="text-ink-muted">Class</span>
            <Select name="classLevelId" defaultValue={params.classLevelId ?? ''} className="mt-1 w-40">
              <option value="">All classes</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </label>
          <label className="block text-sm">
            <span className="text-ink-muted">Show</span>
            <Select name="filter" defaultValue={params.filter ?? 'all'} className="mt-1 w-48">
              <option value="all">All students</option>
              <option value="defaulters">Defaulters (overdue)</option>
              <option value="high">High overdue (₹5,000+)</option>
              <option value="zero">Zero dues</option>
            </Select>
          </label>
          <label className="block text-sm">
            <span className="text-ink-muted">Student</span>
            <Input name="q" defaultValue={params.q ?? ''} placeholder="Name or admission no." className="mt-1 w-52" />
          </label>
          <Button type="submit" variant="secondary">Apply</Button>
        </form>
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-ink-muted">
          <span><span className="mr-1 inline-block size-2.5 rounded-sm bg-success-bg align-middle" />Paid</span>
          <span><span className="mr-1 inline-block size-2.5 rounded-sm bg-warning-bg align-middle" />Part paid</span>
          <span><span className="mr-1 inline-block size-2.5 rounded-sm bg-danger-bg align-middle" />Overdue</span>
          <span><span className="mr-1 inline-block size-2.5 rounded-sm bg-surface-2 align-middle" />Not yet due</span>
          <span>· = not billed</span>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {grid.rows.length === 0 ? (
          <EmptyState title="No students match" description="Change the filters or financial year." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="sticky top-0 bg-surface">
                <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-ink-muted">
                  <th className="sticky left-0 bg-surface px-3 py-2">Student</th>
                  <th className="px-2 py-2">Class</th>
                  {FY_MONTH_LABELS.map((m) => <th key={m} className="px-1 py-2 text-center">{m}</th>)}
                  <th className="px-3 py-2 text-right">Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {pageRows.map((r) => (
                  <tr key={r.studentId}>
                    <td className="sticky left-0 bg-surface px-3 py-1.5">
                      <Link href={`/finance/students/${r.studentId}`} className="font-medium text-ink hover:text-[var(--brand-600)]">{r.name}</Link>
                      <span className="block text-xs text-ink-subtle">{r.admissionNo}</span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-xs text-ink-muted">{r.className}</td>
                    {r.months.map((c, i) => <Cell key={i} cell={c} />)}
                    <td className={`px-3 py-1.5 text-right font-medium tnum ${r.overdueMinor > 0 ? 'text-[var(--danger)]' : ''}`}>
                      {r.balanceMinor > 0 ? formatMoney(r.balanceMinor, currency) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-line-strong text-xs font-semibold">
                  <td className="sticky left-0 bg-surface px-3 py-2" colSpan={2}>Balance due by month</td>
                  {grid.monthTotals.map((t, i) => (
                    <td key={i} className="px-1 py-2 text-center tnum">{t.balanceMinor > 0 ? short(t.balanceMinor) : '—'}</td>
                  ))}
                  <td className="px-3 py-2 text-right tnum">{formatMoney(grid.totals.balanceMinor, currency)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        {pages > 1 ? (
          <div className="flex items-center justify-between border-t border-[var(--border)] px-4 py-3 text-sm">
            <span className="text-ink-muted">Page {page} of {pages} · {grid.rows.length} students</span>
            <span className="flex gap-3">
              {page > 1 ? <Link href={`?${qs({ page: String(page - 1) })}`} className="text-[var(--brand-600)] hover:underline">Previous</Link> : null}
              {page < pages ? <Link href={`?${qs({ page: String(page + 1) })}`} className="text-[var(--brand-600)] hover:underline">Next</Link> : null}
            </span>
          </div>
        ) : null}
      </Card>
    </div>
  )
}
