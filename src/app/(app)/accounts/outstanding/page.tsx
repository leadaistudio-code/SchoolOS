import Link from 'next/link'
import { requireContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { EmptyState, Notice } from '@/components/ui/states'
import { Table, TableWrap, THead, TH, TBody, TR, TD } from '@/components/ui/table'
import { attendanceDate, formatDay } from '@/lib/dates'
import { outstandingBySession } from '@/server/modules/accounts/outstanding'
import { AccountsTabs, Metric, moneyFmt } from '../ui'

export const metadata = { title: 'Fee outstanding by session' }

const ROW_LIMIT = 500

export default async function OutstandingPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireContext('accounts.view')
  const params = await searchParams
  const data = await outstandingBySession(ctx, {
    session: params.session || undefined,
    basis: params.basis === 'billed' ? 'billed' : 'due',
    classLevelId: params.classLevelId || undefined,
    q: params.q || undefined,
  })
  const { money } = moneyFmt(ctx.tenant.currency || 'INR')
  const amt = (minor: number) => (minor ? money(minor) : '—')

  if (!data.selected) {
    return (
      <div className="space-y-4">
        <PageHeader title="Fee outstanding by session" />
        <AccountsTabs active="/accounts/outstanding" />
        <Notice tone="info" title="No academic session">Create an academic session to see outstanding fees by year.</Notice>
      </div>
    )
  }
  const selected = data.selected
  const pastColumns = data.columns.filter((c) => c.id !== selected.id)
  const shown = data.rows.slice(0, ROW_LIMIT)
  const basisLabel = data.basis === 'due' ? `due on or before ${formatDay(attendanceDate(data.today))}` : 'all issued invoices, including instalments not yet due'

  return (
    <div className="space-y-4">
      <PageHeader
        title="Fee outstanding by session"
        description="Unpaid fees split by the academic session each invoice belongs to: the chosen session is the current year, every earlier session is past years."
        actions={
          ctx.can('fees.accounts') ? (
            <Link href="/finance/dues" className="text-sm font-medium text-[var(--brand-600)] hover:underline">Dues and reminders →</Link>
          ) : null
        }
      />
      <AccountsTabs active="/accounts/outstanding" />

      <Card className="no-print p-4">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="block text-sm">
            <span className="text-ink-muted">Current year (session)</span>
            <Select name="session" defaultValue={selected.id} className="mt-1 w-48">
              {[...data.sessions].reverse().map((s) => (
                <option key={s.id} value={s.id}>{s.name}{s.isCurrent ? ' (current)' : ''}</option>
              ))}
            </Select>
          </label>
          <label className="block text-sm">
            <span className="text-ink-muted">Count</span>
            <Select name="basis" defaultValue={data.basis} className="mt-1 w-56">
              <option value="due">Due till today</option>
              <option value="billed">Everything billed</option>
            </Select>
          </label>
          <label className="block text-sm">
            <span className="text-ink-muted">Class</span>
            <Select name="classLevelId" defaultValue={params.classLevelId ?? ''} className="mt-1 w-40">
              <option value="">All classes</option>
              {data.classOptions.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </label>
          <label className="block text-sm">
            <span className="text-ink-muted">Student</span>
            <Input name="q" defaultValue={params.q ?? ''} placeholder="Name or admission no." className="mt-1 w-56" />
          </label>
          <Button type="submit" variant="secondary">Apply</Button>
        </form>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label={`Current year outstanding · ${selected.name}`} value={money(data.totals.currentMinor)} hint={basisLabel} />
        <Metric
          label="Past year outstanding"
          value={money(data.totals.pastMinor)}
          hint={pastColumns.length ? `Sessions before ${selected.name}: ${pastColumns.map((c) => c.name).join(', ')}` : `Nothing left from before ${selected.name}`}
        />
        <Metric label="Total outstanding" value={money(data.totals.totalMinor)} hint={`${data.totals.students} students owe fees`} />
      </div>

      {data.classes.length > 0 ? (
        <Card className="overflow-hidden">
          <CardHeader><CardTitle>By class</CardTitle></CardHeader>
          <CardContent className="p-0">
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <TH>Class (current)</TH>
                    <TH align="right">Students</TH>
                    <TH align="right">Current year · {selected.name}</TH>
                    <TH align="right">Past years</TH>
                    <TH align="right">Total</TH>
                  </tr>
                </THead>
                <TBody>
                  {data.classes.map((c) => (
                    <TR key={c.name}>
                      <TD>{c.name}</TD>
                      <TD align="right">{c.students}</TD>
                      <TD align="right">{amt(c.currentMinor)}</TD>
                      <TD align="right">{amt(c.pastMinor)}</TD>
                      <TD align="right" className="font-medium">{amt(c.totalMinor)}</TD>
                    </TR>
                  ))}
                  <tr className="border-t-2 border-line-strong font-semibold">
                    <td className="px-3 py-2">Total</td>
                    <td className="px-3 py-2 text-right tnum">{data.totals.students}</td>
                    <td className="px-3 py-2 text-right tnum">{money(data.totals.currentMinor)}</td>
                    <td className="px-3 py-2 text-right tnum">{money(data.totals.pastMinor)}</td>
                    <td className="px-3 py-2 text-right tnum">{money(data.totals.totalMinor)}</td>
                  </tr>
                </TBody>
              </Table>
            </TableWrap>
          </CardContent>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <CardHeader><CardTitle>By student</CardTitle></CardHeader>
        <CardContent className="p-0">
          {data.rows.length === 0 ? (
            <EmptyState title="Nothing outstanding" description="No unpaid fees match these filters." />
          ) : (
            <TableWrap sticky>
              <Table>
                <THead sticky>
                  <tr>
                    <TH>Student</TH>
                    <TH>Class</TH>
                    {pastColumns.map((c) => (
                      <TH key={c.id} align="right">{c.name}</TH>
                    ))}
                    <TH align="right">Past years</TH>
                    <TH align="right">Current year · {selected.name}</TH>
                    <TH align="right">Total</TH>
                  </tr>
                </THead>
                <TBody>
                  {shown.map((r) => (
                    <TR key={r.studentId}>
                      <TD>
                        <Link href={`/finance/students/${r.studentId}`} className="font-medium text-[var(--brand-600)] hover:underline">{r.name}</Link>
                        <span className="block text-xs text-ink-subtle">
                          {r.admissionNo ?? '—'}
                          {r.status !== 'ACTIVE' ? <Badge tone="neutral" className="ml-2">{r.status.toLowerCase()}</Badge> : null}
                        </span>
                      </TD>
                      <TD className="text-sm">{r.className}</TD>
                      {pastColumns.map((c) => (
                        <TD key={c.id} align="right">{amt(r.bySession[c.id] ?? 0)}</TD>
                      ))}
                      <TD align="right">{amt(r.pastMinor)}</TD>
                      <TD align="right">{amt(r.currentMinor)}</TD>
                      <TD align="right" className="font-medium">{money(r.totalMinor)}</TD>
                    </TR>
                  ))}
                  <tr className="border-t-2 border-line-strong font-semibold">
                    <td className="px-3 py-2" colSpan={2}>Total ({data.totals.students} students)</td>
                    {pastColumns.map((c) => (
                      <td key={c.id} className="px-3 py-2 text-right tnum">{money(data.totals.bySession[c.id] ?? 0)}</td>
                    ))}
                    <td className="px-3 py-2 text-right tnum">{money(data.totals.pastMinor)}</td>
                    <td className="px-3 py-2 text-right tnum">{money(data.totals.currentMinor)}</td>
                    <td className="px-3 py-2 text-right tnum">{money(data.totals.totalMinor)}</td>
                  </tr>
                </TBody>
              </Table>
            </TableWrap>
          )}
          {data.rows.length > ROW_LIMIT ? (
            <p className="border-t border-line px-4 py-2 text-xs text-ink-subtle">
              Showing the {ROW_LIMIT} largest of {data.rows.length} students. The totals include everyone; filter by class to see the rest.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
