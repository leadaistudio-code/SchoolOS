import Link from 'next/link'
import { Download } from 'lucide-react'
import { requireContext } from '@/server/context'
import { getViewSession } from '@/server/view-session'
import { sessionClassOptions } from '@/server/modules/finance/student-fee-report'
import {
  purchaseItemOptions,
  studentPurchaseReport,
  studentPurchaseSchema,
} from '@/server/modules/store/student-purchases'
import { STORE_CATEGORIES, storeCategory } from '@/lib/store/options'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { Field, Input, Select } from '@/components/ui/input'
import { Metric } from '@/components/ui/metric'
import { EmptyState, Notice } from '@/components/ui/states'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { formatDay } from '@/lib/dates'
import { cn, formatMoney } from '@/lib/utils'
import { StoreTabs } from '../store-tabs'

export const metadata = { title: 'Student purchases' }

const STAMP = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' })
const SHOW_LIMIT = 500

function day(iso: string) {
  return formatDay(new Date(`${iso}T00:00:00Z`))
}

export default async function StudentPurchasesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireContext('store.view')
  const params = await searchParams
  const filter = studentPurchaseSchema.parse(params)
  const session = await getViewSession(ctx)
  const money = (minor: number) => formatMoney(minor, ctx.tenant.currency)

  if (!session) {
    return (
      <div className="space-y-4">
        <PageHeader title="Student purchases" />
        <StoreTabs ctx={ctx} active="students" />
        <Notice tone="warning">Set up an academic session to see purchases by class.</Notice>
      </div>
    )
  }

  const [classes, items, report] = await Promise.all([
    sessionClassOptions(ctx, session),
    purchaseItemOptions(ctx),
    studentPurchaseReport(ctx, session, filter),
  ])
  const what = filter.item ?? (filter.category ? storeCategory(filter.category).label : null)
  const query = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams()
    for (const [k, v] of Object.entries({ ...params, ...patch })) if (v) next.set(k, v)
    return next.toString()
  }
  const missingView = filter.view === 'missing'
  const shown = missingView ? report.missing.slice(0, SHOW_LIMIT) : report.bought.slice(0, SHOW_LIMIT)
  const listed = missingView ? report.missing.length : report.bought.length

  return (
    <div className="space-y-4">
      <PageHeader
        title="Student purchases"
        description={`Who bought what from the store, class by class · ${day(report.from)} to ${day(report.to)}`}
        actions={
          <a href={`/api/v1/store/student-purchases/export?${query({})}`} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
            <Download className="size-4" aria-hidden />
            Download CSV
          </a>
        }
      />
      <StoreTabs ctx={ctx} active="students" />

      <Card className="no-print p-4">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="view" value={filter.view} />
          <Field label="Class" htmlFor="sp-class">
            <Select id="sp-class" name="classLevelId" defaultValue={filter.classLevelId ?? ''}>
              <option value="">All classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Section" htmlFor="sp-section">
            <Select id="sp-section" name="sectionId" defaultValue={filter.sectionId ?? ''}>
              <option value="">All sections</option>
              {classes.map((c) => (
                <optgroup key={c.id} label={c.name}>
                  {c.sections.map((s) => (
                    <option key={s.id} value={s.id}>{c.name} – {s.name}</option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </Field>
          <Field label="Category" htmlFor="sp-category">
            <Select id="sp-category" name="category" defaultValue={filter.category ?? ''}>
              <option value="">All categories</option>
              {STORE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Item (all sizes)" htmlFor="sp-item">
            <Select id="sp-item" name="item" defaultValue={filter.item ?? ''}>
              <option value="">All items</option>
              {items.map((i) => (
                <option key={i.name} value={i.name}>{i.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Student" htmlFor="sp-q">
            <Input id="sp-q" name="q" defaultValue={filter.q ?? ''} placeholder="Name or admission no." className="w-48" />
          </Field>
          <Field label="From" htmlFor="sp-from">
            <Input id="sp-from" type="date" name="from" defaultValue={report.from} className="w-40" />
          </Field>
          <Field label="To" htmlFor="sp-to">
            <Input id="sp-to" type="date" name="to" defaultValue={report.to} className="w-40" />
          </Field>
          <Button type="submit" variant="secondary">Apply</Button>
          {Object.keys(params).some((k) => k !== 'view' && params[k]) ? (
            <Link href={`/inventory/store/students?view=${filter.view}`} className="pb-2 text-sm text-ink-muted hover:text-ink">
              Clear
            </Link>
          ) : null}
        </form>
      </Card>

      <div className="flex flex-wrap gap-1 rounded-lg border border-line bg-surface p-1 text-sm w-fit">
        <ViewLink href={`/inventory/store/students?${query({ view: 'bought' })}`} active={!missingView}>
          Bought{what ? ` ${what}` : ''}
        </ViewLink>
        <ViewLink href={`/inventory/store/students?${query({ view: 'missing' })}`} active={missingView}>
          Not bought{what ? ` ${what}` : ''}
        </ViewLink>
      </div>

      {report.canCheckMissing ? (
        <div className="grid gap-3 sm:grid-cols-4">
          <Metric label="Students" value={String(report.totals.students)} />
          <Metric label={`Bought ${what}`} value={String(report.totals.buyers)} />
          <Metric label="Not bought yet" value={String(report.totals.missing)} />
          <Metric label="Sold" value={money(report.totals.amountMinor)} sub={`${report.totals.quantity} units`} />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="Lines sold to students" value={String(report.bought.length)} />
          <Metric label="Units" value={String(report.totals.quantity)} />
          <Metric label="Amount" value={money(report.totals.amountMinor)} />
        </div>
      )}

      {report.canCheckMissing && report.coverage.length > 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>{what} by class</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <TH>Class</TH>
                    <TH align="right">Students</TH>
                    <TH align="right">Bought</TH>
                    <TH align="right">Not bought</TH>
                    <TH>Progress</TH>
                  </tr>
                </THead>
                <TBody>
                  {report.coverage.map((c) => {
                    const pct = c.students ? Math.round((c.bought / c.students) * 100) : 0
                    return (
                      <TR key={c.classLevelId}>
                        <TD>
                          <Link
                            href={`/inventory/store/students?${query({ classLevelId: c.classLevelId, sectionId: undefined, view: 'missing' })}`}
                            className="font-medium text-[var(--brand-600)] hover:underline"
                          >
                            {c.className}
                          </Link>
                        </TD>
                        <TD align="right" className="tnum">{c.students}</TD>
                        <TD align="right" className="tnum">{c.bought}</TD>
                        <TD align="right" className={cn('tnum', c.missing ? 'font-semibold text-[var(--danger)]' : '')}>{c.missing}</TD>
                        <TD>
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-28 overflow-hidden rounded-full bg-surface-2">
                              <div className="h-full rounded-full bg-[var(--success)]" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs text-ink-muted tnum">{pct}%</span>
                          </div>
                        </TD>
                      </TR>
                    )
                  })}
                </TBody>
              </Table>
            </TableWrap>
          </CardContent>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        {missingView && !report.canCheckMissing ? (
          <EmptyState
            title="Pick an item or a category"
            description="Choose, for example, the practical book or Uniform & dress above to list the students who have not bought it yet."
          />
        ) : listed === 0 ? (
          <EmptyState
            title={missingView ? `Every student has bought ${what}` : 'No purchases found'}
            description={missingView ? 'Nobody in this selection is missing it.' : 'Bills made for students at the store counter show up here.'}
          />
        ) : missingView ? (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Class</TH>
                  <TH align="right">Roll</TH>
                  <TH>Student</TH>
                  <TH>Admission no.</TH>
                  <TH>Parent phone</TH>
                </tr>
              </THead>
              <TBody>
                {report.missing.slice(0, SHOW_LIMIT).map((r) => (
                  <TR key={r.studentId}>
                    <TD className="whitespace-nowrap">{r.className}{r.sectionName ? ` – ${r.sectionName}` : ''}</TD>
                    <TD align="right" className="tnum">{r.rollNumber ?? '—'}</TD>
                    <TD>
                      <Link href={`/students/${r.studentId}`} className="font-medium text-[var(--brand-600)] hover:underline">{r.name}</Link>
                    </TD>
                    <TD>{r.admissionNo}</TD>
                    <TD>{r.parentPhone ?? '—'}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Date</TH>
                  <TH>Class</TH>
                  <TH>Student</TH>
                  <TH>Item</TH>
                  <TH align="right">Qty</TH>
                  <TH align="right">Amount</TH>
                  <TH>Bill</TH>
                </tr>
              </THead>
              <TBody>
                {report.bought.slice(0, SHOW_LIMIT).map((r) => (
                  <TR key={r.lineId}>
                    <TD className="whitespace-nowrap">{STAMP.format(r.soldAt)}</TD>
                    <TD className="whitespace-nowrap">{r.className ? `${r.className}${r.sectionName ? ` – ${r.sectionName}` : ''}` : '—'}</TD>
                    <TD>
                      <Link href={`/students/${r.studentId}`} className="font-medium text-[var(--brand-600)] hover:underline">{r.name}</Link>
                      <span className="block text-xs text-ink-subtle">{r.admissionNo}</span>
                    </TD>
                    <TD>
                      {r.item}
                      <span className="block text-xs text-ink-subtle">{storeCategory(r.category).label}</span>
                    </TD>
                    <TD align="right" className="tnum">{r.quantity}</TD>
                    <TD align="right" className="tnum">{money(r.amountMinor)}</TD>
                    <TD>
                      <Link href={`/inventory/store/sales/${r.saleId}`} className="text-[var(--brand-600)] hover:underline">{r.billNumber}</Link>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Card>
      {listed > shown.length ? (
        <p className="text-xs text-ink-subtle">
          Showing the first {SHOW_LIMIT} of {listed}. Narrow by class, or download the CSV for the full list.
        </p>
      ) : null}
      <p className="text-xs text-ink-subtle">
        Only bills made for a student count; walk-in bills and voided bills are left out. &ldquo;Not bought&rdquo; lists active
        students of {session.name} in the chosen classes with no bill for the item in these dates.
      </p>
    </div>
  )
}

function ViewLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        'rounded-md px-3 py-1.5 transition-colors',
        active ? 'bg-[var(--brand-50)] font-semibold text-[var(--brand-600)]' : 'text-ink-muted hover:text-ink',
      )}
    >
      {children}
    </Link>
  )
}
