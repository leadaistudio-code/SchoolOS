import Link from 'next/link'
import { requireContext } from '@/server/context'
import { feeReportsSummary } from '@/server/modules/finance/simplicity'
import {
  FEE_STATUS_LABEL,
  sessionClassOptions,
  studentFeePayersReport,
  studentFeeReportSchema,
  studentFeeStatusReport,
  type FeeStatus,
} from '@/server/modules/finance/student-fee-report'
import { getViewSession, periodOrSession } from '@/server/view-session'
import { PageHeader } from '@/components/page-header'
import { BackButton } from '@/components/back-button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Metric } from '@/components/ui/metric'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { Notice } from '@/components/ui/states'
import { Pagination } from '@/components/pagination'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { formatMoney } from '@/lib/utils'
import { drillHref } from '@/server/drill/descriptor'
import { DrillFigure } from '@/components/drill-figure'
import { FeeSimulator } from './fee-simulator'
import { StudentReportFilters } from './student-report-filters'

export const metadata = { title: 'Fee reports' }

const PAGE_SIZE = 50

const STATUS_TONE: Record<FeeStatus, BadgeTone> = {
  paid: 'success',
  partial: 'warning',
  unpaid: 'danger',
  none: 'neutral',
}

type Params = {
  from?: string
  to?: string
  view?: string
  status?: string
  classLevelId?: string
  sectionId?: string
  q?: string
  sfrom?: string
  sto?: string
  page?: string
}

export default async function FeeReportsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const ctx = await requireContext('fees.report')
  const params = await searchParams
  const session = await getViewSession(ctx)
  const period = periodOrSession(session, params.from, params.to)
  const filter = studentFeeReportSchema.parse({
    view: params.view,
    status: params.status,
    classLevelId: params.classLevelId,
    sectionId: params.sectionId,
    q: params.q,
    from: params.sfrom,
    to: params.sto,
  })
  const page = Math.max(1, Number(params.page) || 1)

  const [report, structures, classes, status, payers] = await Promise.all([
    feeReportsSummary(ctx, period.from, period.to),
    ctx.can('fees.owner_analytics')
      ? ctx.db.feeStructure.findMany({
          where: { deletedAt: null, status: 'PUBLISHED' },
          orderBy: { name: 'asc' },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    session ? sessionClassOptions(ctx, session) : Promise.resolve([]),
    session && filter.view === 'status' ? studentFeeStatusReport(ctx, session, filter) : Promise.resolve(null),
    session && filter.view === 'payers' ? studentFeePayersReport(ctx, session, filter) : Promise.resolve(null),
  ])
  const currency = ctx.tenant.currency
  const rate = report.billedMinor > 0
    ? Math.round(((report.billedMinor - report.outstandingMinor) / report.billedMinor) * 100)
    : 0
  const resultCount = status?.rows.length ?? payers?.rows.length ?? 0
  const pct = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 100)}%` : '—')
  const feeDrill = (k: 'fee-billed' | 'fee-collected' | 'fee-outstanding') => drillHref(ctx.tenant.id, { k, f: period.from, t: period.to })

  return (
    <div className="space-y-4">
      <PageHeader
        title="Reports"
        description={session ? `Session ${session.name} · collection, outstanding and who has paid` : 'Collection, outstanding and payment-method totals'}
        actions={<BackButton fallbackHref="/finance" />}
      />
      <Card>
        <CardContent>
          <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            {Object.entries(params)
              .filter(([k, v]) => v && !['from', 'to', 'page'].includes(k))
              .map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
            <Field label="From" htmlFor="report-from">
              <Input id="report-from" name="from" type="date" defaultValue={period.from} />
            </Field>
            <Field label="To" htmlFor="report-to">
              <Input id="report-to" name="to" type="date" defaultValue={period.to} />
            </Field>
            <Button type="submit" variant="secondary">Apply</Button>
          </form>
        </CardContent>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Expected billing" value={formatMoney(report.billedMinor, currency)} href={feeDrill('fee-billed')} />
        <Metric label="Collected" value={formatMoney(report.collectedMinor, currency)} href={feeDrill('fee-collected')} />
        <Metric label="Outstanding" value={formatMoney(report.outstandingMinor, currency)} href={feeDrill('fee-outstanding')} />
        <Metric label="Collection rate" value={`${rate}%`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader><CardTitle>Payment methods</CardTitle></CardHeader>
          <CardContent className="p-0">
            <TableWrap>
              <Table>
                <THead><tr><TH>Method</TH><TH align="right">Payments</TH><TH align="right">Collected</TH></tr></THead>
                <TBody>
                  {report.byMode.map((row) => (
                    <TR key={row.mode}>
                      <TD className="text-sm">{row.mode.toLowerCase().replace('_', ' ')}</TD>
                      <TD align="right">{row._count._all}</TD>
                      <TD align="right" className="font-medium">
                        <DrillFigure href={drillHref(ctx.tenant.id, { k: 'fee-collected', f: period.from, t: period.to, m: row.mode })}>
                          {formatMoney(row._sum.amountMinor ?? 0, currency)}
                        </DrillFigure>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Adjustments</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between gap-3 text-sm"><span className="text-ink-muted">Concessions</span><span className="tnum">{formatMoney(report.concessionMinor, currency)}</span></div>
            <div className="flex justify-between gap-3 text-sm"><span className="text-ink-muted">Late fees</span><span className="tnum">{formatMoney(report.lateFeeMinor, currency)}</span></div>
            <div className="flex justify-between gap-3 text-sm"><span className="text-ink-muted">Refunds</span><span className="tnum">{formatMoney(report.refundMinor, currency)}</span></div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Students and fees</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {!session ? (
            <Notice tone="info">Create an academic session in Settings to see students by fee status.</Notice>
          ) : (
            <StudentReportFilters
              classes={classes}
              canExport={ctx.can('fees.export')}
              resultCount={resultCount}
              defaultFrom={session.range.from}
              defaultTo={session.range.to}
            />
          )}

          {status ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Metric label="Students" value={String(status.totalStudents)} sub={`Session ${status.session.name}`} />
                <Metric label="Fully paid" value={String(status.counts.paid)} sub={pct(status.counts.paid, status.totalStudents)} emphasis="success" />
                <Metric label="Partly paid" value={String(status.counts.partial)} sub={pct(status.counts.partial, status.totalStudents)} emphasis="warning" />
                <Metric
                  label="Not paid"
                  value={String(status.counts.unpaid)}
                  sub={status.counts.none ? `${pct(status.counts.unpaid, status.totalStudents)} · ${status.counts.none} with no fees billed` : pct(status.counts.unpaid, status.totalStudents)}
                  emphasis={status.counts.unpaid > 0 ? 'danger' : undefined}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Metric label="Billed this session" value={formatMoney(status.billedMinor, currency)} />
                <Metric label="Collected against it" value={formatMoney(status.paidMinor, currency)} sub={pct(status.paidMinor, status.billedMinor)} />
                <Metric label="Still due" value={formatMoney(status.balanceMinor, currency)} />
              </div>

              {status.byClass.length > 1 ? (
                <div className="overflow-hidden rounded-[var(--radius)] border border-line">
                  <TableWrap>
                    <Table>
                      <THead>
                        <tr>
                          <TH>Class</TH>
                          <TH align="right">Students</TH>
                          <TH align="right">Fully paid</TH>
                          <TH align="right">Partly paid</TH>
                          <TH align="right">Not paid</TH>
                          <TH align="right">Billed</TH>
                          <TH align="right">Collected</TH>
                          <TH align="right">Due</TH>
                          <TH align="right">Rate</TH>
                        </tr>
                      </THead>
                      <TBody>
                        {status.byClass.map((c) => (
                          <TR key={c.classLevelId}>
                            <TD>
                              <Link className="text-sm font-medium text-ink hover:underline" href={`?${new URLSearchParams({ ...(params.status ? { status: params.status } : {}), classLevelId: c.classLevelId }).toString()}`}>
                                {c.className}
                              </Link>
                            </TD>
                            <TD align="right" className="tnum">{c.students}</TD>
                            <TD align="right" className="tnum text-success">{c.paid}</TD>
                            <TD align="right" className="tnum text-warning">{c.partial}</TD>
                            <TD align="right" className="tnum text-[var(--danger)]">{c.unpaid}</TD>
                            <TD align="right" className="tnum">{formatMoney(c.billedMinor, currency)}</TD>
                            <TD align="right" className="tnum">{formatMoney(c.paidMinor, currency)}</TD>
                            <TD align="right" className="tnum font-medium">{formatMoney(c.balanceMinor, currency)}</TD>
                            <TD align="right" className="tnum">{pct(c.paidMinor, c.billedMinor)}</TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  </TableWrap>
                </div>
              ) : null}

              <div className="overflow-hidden rounded-[var(--radius)] border border-line">
                <TableWrap>
                  <Table>
                    <THead>
                      <tr>
                        <TH>Student</TH>
                        <TH>Class</TH>
                        <TH>Status</TH>
                        <TH align="right">Billed</TH>
                        <TH align="right">Paid</TH>
                        <TH align="right">Balance</TH>
                      </tr>
                    </THead>
                    <TBody>
                      {status.rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((r) => (
                        <TR key={r.studentId}>
                          <TD>
                            <Link href={`/finance/students/${r.studentId}`} className="text-sm font-medium text-ink hover:underline">{r.name}</Link>
                            <div className="text-xs text-ink-subtle">{r.admissionNo}{r.parentPhone ? ` · ${r.parentPhone}` : ''}</div>
                          </TD>
                          <TD className="text-sm">{r.className}{r.sectionName ? ` – ${r.sectionName}` : ''}</TD>
                          <TD><Badge tone={STATUS_TONE[r.status]}>{FEE_STATUS_LABEL[r.status]}</Badge></TD>
                          <TD align="right" className="tnum">{formatMoney(r.billedMinor, currency)}</TD>
                          <TD align="right" className="tnum">{formatMoney(r.paidMinor, currency)}</TD>
                          <TD align="right" className="tnum font-medium">{formatMoney(r.balanceMinor, currency)}</TD>
                        </TR>
                      ))}
                      {status.rows.length === 0 ? (
                        <TR><TD colSpan={6} className="py-6 text-center text-sm text-ink-muted">No students match these filters.</TD></TR>
                      ) : null}
                    </TBody>
                  </Table>
                </TableWrap>
                <Pagination total={status.rows.length} page={page} pageSize={PAGE_SIZE} label="students" />
              </div>
            </>
          ) : null}

          {payers ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Metric label="Students who paid" value={String(payers.students)} sub={`${payers.period.from ?? '…'} to ${payers.period.to ?? '…'}`} />
                <Metric label="Payments" value={String(payers.payments)} />
                <Metric label="Amount collected" value={formatMoney(payers.amountMinor, currency)} />
                <Metric label="Average per student" value={formatMoney(payers.averageMinor, currency)} />
              </div>
              {payers.byMode.length > 0 ? (
                <div className="flex flex-wrap gap-2 text-xs text-ink-muted">
                  {payers.byMode.map((m) => (
                    <span key={m.mode} className="rounded-[6px] border border-line px-2 py-1">
                      {m.mode.toLowerCase().replace('_', ' ')}: <span className="tnum font-medium text-ink">{formatMoney(m.amountMinor, currency)}</span> ({m.payments})
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="overflow-hidden rounded-[var(--radius)] border border-line">
                <TableWrap>
                  <Table>
                    <THead>
                      <tr>
                        <TH>Student</TH>
                        <TH>Class</TH>
                        <TH align="right">Payments</TH>
                        <TH align="right">Amount paid</TH>
                        <TH align="right">Last paid</TH>
                      </tr>
                    </THead>
                    <TBody>
                      {payers.rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((r) => (
                        <TR key={r.studentId}>
                          <TD>
                            <Link href={`/finance/students/${r.studentId}`} className="text-sm font-medium text-ink hover:underline">{r.name}</Link>
                            <div className="text-xs text-ink-subtle">{r.admissionNo}</div>
                          </TD>
                          <TD className="text-sm">{r.className}{r.sectionName ? ` – ${r.sectionName}` : ''}</TD>
                          <TD align="right" className="tnum">{r.payments}</TD>
                          <TD align="right" className="tnum font-medium">{formatMoney(r.amountMinor, currency)}</TD>
                          <TD align="right" className="tnum text-sm">{r.lastPaidAt ? r.lastPaidAt.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) : '—'}</TD>
                        </TR>
                      ))}
                      {payers.rows.length === 0 ? (
                        <TR><TD colSpan={5} className="py-6 text-center text-sm text-ink-muted">Nobody paid in this period.</TD></TR>
                      ) : null}
                    </TBody>
                  </Table>
                </TableWrap>
                <Pagination total={payers.rows.length} page={page} pageSize={PAGE_SIZE} label="students" />
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      {ctx.can('fees.owner_analytics') ? <FeeSimulator structures={structures} currency={currency} /> : null}
    </div>
  )
}
