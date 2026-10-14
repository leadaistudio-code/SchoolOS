import Link from 'next/link'
import { requireContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { EmptyState, Notice } from '@/components/ui/states'
import { Pagination } from '@/components/pagination'
import { Table, TableWrap, THead, TH, TBody, TR, TD } from '@/components/ui/table'
import { AttachmentUpload } from '@/components/accounting/payables-forms'
import { DayBookExpenseDialog, RepairPostingsButton } from '@/components/accounting/day-book-forms'
import { formatDay } from '@/lib/dates'
import { schoolToday } from '@/lib/periods'
import { getAccountingFlags } from '@/server/modules/accounting/service'
import { DAY_BOOK_ROW_LIMIT, getDayBook, getDayBookReconciliation } from '@/server/modules/accounting/day-book-service'
import { AccountsTabs, Metric, SOURCE_LABEL, moneyFmt, sourceHref } from '../ui'

export const metadata = { title: 'Day Book' }

const MODE_LABEL: Record<string, string> = { CASH: 'Cash', BANK_TRANSFER: 'Bank transfer', CHEQUE: 'Cheque', UPI: 'UPI', CARD: 'Card', OTHER: 'Other' }

function day(iso: string) {
  return formatDay(new Date(`${iso}T00:00:00Z`))
}

export default async function DayBookPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireContext('accounts.view')
  const flags = await getAccountingFlags(ctx.db)
  if (!flags.module) {
    return (
      <div className="space-y-4">
        <PageHeader title="Day Book" />
        <AccountsTabs active="/accounts/day-book" />
        <Notice tone="info" title="Not enabled">The Day Book is switched off for this school.</Notice>
      </div>
    )
  }
  const params = await searchParams
  const [book, rec] = await Promise.all([getDayBook(ctx, params), getDayBookReconciliation(ctx, params)])
  const { money } = moneyFmt(ctx.tenant.currency || 'INR')
  const canRecord = ctx.can('expenses.manage')
  const canAttach = canRecord && ctx.can('expenses.view')
  const canRepair = ctx.can('accounts.manage')
  const name = (id: string) => {
    const a = book.accounts[id]
    return a ? `${a.code} · ${a.name}` : 'Unknown account'
  }

  const [heads, headAccounts] = await Promise.all([
    canRecord
      ? ctx.db.expenseHead.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } })
      : Promise.resolve([]),
    ctx.db.ledgerAccount.findMany({
      where: { isActive: true, id: { notIn: book.cashAccounts.map((a) => a.id) } },
      orderBy: [{ type: 'asc' }, { code: 'asc' }],
      select: { id: true, code: true, name: true, type: true },
    }),
  ])
  const activeCash = book.cashAccounts.filter((a) => a.isActive)
  const dayTotals = new Map(book.days.map((d) => [d.date, d]))
  const pageDays = [...new Set(book.rows.map((r) => r.date))]
  const query: Record<string, string> = {}
  for (const [k, v] of Object.entries(params)) if (v && k !== 'page') query[k] = v

  return (
    <div className="space-y-4">
      <PageHeader
        title="Day Book"
        description={`Cash and bank register · ${day(book.range.from)} to ${day(book.range.to)}`}
        actions={
          canRecord && heads.length ? (
            <DayBookExpenseDialog
              heads={heads.map((h) => ({ id: h.id, label: h.name }))}
              cashAccounts={activeCash.map((a) => ({ id: a.id, label: `${a.code} · ${a.name}` }))}
              today={schoolToday()}
            />
          ) : null
        }
      />
      <AccountsTabs active="/accounts/day-book" />

      <Card className="no-print p-4">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="block text-sm">
            <span className="text-ink-muted">From</span>
            <Input type="date" name="from" defaultValue={book.range.from} className="mt-1 w-40" />
          </label>
          <label className="block text-sm">
            <span className="text-ink-muted">To</span>
            <Input type="date" name="to" defaultValue={book.range.to} className="mt-1 w-40" />
          </label>
          <label className="block text-sm">
            <span className="text-ink-muted">Cash / bank</span>
            <Select name="cash" defaultValue={book.filter.cash ?? ''} className="mt-1 w-48">
              <option value="">All cash and bank</option>
              {book.cashAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
            </Select>
          </label>
          <label className="block text-sm">
            <span className="text-ink-muted">Account head</span>
            <Select name="head" defaultValue={book.filter.head ?? ''} className="mt-1 w-56">
              <option value="">All heads</option>
              {headAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
            </Select>
          </label>
          <label className="block text-sm">
            <span className="text-ink-muted">Type</span>
            <Select name="direction" defaultValue={book.filter.direction} className="mt-1 w-36">
              <option value="all">Payments and receipts</option>
              <option value="payments">Payments only</option>
              <option value="receipts">Receipts only</option>
            </Select>
          </label>
          <label className="block text-sm">
            <span className="text-ink-muted">Source</span>
            <Select name="source" defaultValue={book.filter.source ?? ''} className="mt-1 w-44">
              <option value="">Any source</option>
              {Object.entries(SOURCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </label>
          <label className="block text-sm">
            <span className="text-ink-muted">Search</span>
            <Input name="q" defaultValue={book.filter.q ?? ''} placeholder="Voucher, narration, reference" className="mt-1 w-56" />
          </label>
          <Button type="submit" variant="secondary">Apply</Button>
        </form>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Payments" value={money(book.totals.paidMinor)} hint="paid out of cash and bank" />
        <Metric label="Receipts" value={money(book.totals.receivedMinor)} hint="received into cash and bank" />
        <Metric
          label="Net movement"
          value={`${book.totals.netMinor < 0 ? '−' : ''}${money(book.totals.netMinor)}`}
          tone={book.totals.netMinor < 0 ? 'danger' : 'success'}
        />
        <Metric label="Vouchers" value={String(book.totals.vouchers)} hint={book.filter.head ? 'touching this head' : 'in the register'} />
      </div>

      {book.truncated ? (
        <Notice tone="warning" title="Range too large">
          Over {DAY_BOOK_ROW_LIMIT} vouchers match; only the latest {DAY_BOOK_ROW_LIMIT} are listed. Narrow the dates for exact totals.
        </Notice>
      ) : null}
      {!rec.truncated && !rec.allMatch ? (
        <Notice tone="danger" title="Register does not reconcile">A cash or bank ledger below differs from its journal lines.</Notice>
      ) : null}

      <Card className="overflow-hidden">
        <CardHeader><CardTitle>Register</CardTitle></CardHeader>
        <CardContent className="p-0">
          {book.rows.length === 0 ? (
            <EmptyState title="No vouchers in this range" description="Change the dates or filters." />
          ) : (
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <TH>Voucher</TH>
                    <TH>Payee / narration</TH>
                    <TH>Account head</TH>
                    <TH>Cash / bank</TH>
                    <TH align="right">Paid</TH>
                    <TH align="right">Received</TH>
                    <TH>Bill</TH>
                  </tr>
                </THead>
                <TBody>
                  {pageDays.map((d) => {
                    const totals = dayTotals.get(d)
                    return [
                      <TR key={`day-${d}`} className="bg-[var(--surface-2)]">
                        <TD className="font-medium text-ink" colSpan={4}>{day(d)} · {totals?.vouchers ?? 0} {totals?.vouchers === 1 ? 'voucher' : 'vouchers'}</TD>
                        <TD align="right" className="font-medium">{totals?.paidMinor ? money(totals.paidMinor) : '—'}</TD>
                        <TD align="right" className="font-medium">{totals?.receivedMinor ? money(totals.receivedMinor) : '—'}</TD>
                        <TD />
                      </TR>,
                      ...book.rows.filter((r) => r.date === d).map((r) => {
                        const href = r.sourceHref ?? sourceHref(r.sourceType, r.sourceId)
                        return (
                          <TR key={r.id}>
                            <TD>
                              <Link href={`/accounts/journals/${r.id}`} className="font-medium text-[var(--brand-600)] hover:underline">{r.voucherNumber ?? r.number}</Link>
                              <span className="block text-xs text-ink-subtle">
                                {r.voucherNumber ? `${r.number} · ` : ''}{SOURCE_LABEL[r.sourceType] ?? r.sourceType}
                                {r.isReversal ? ' · reversal' : r.reversedAt ? ' · reversed' : ''}
                              </span>
                            </TD>
                            <TD className="text-sm max-w-72">
                              {r.payee ? <span className="block font-medium text-ink">{r.payee}</span> : null}
                              <span className="block">{r.narration}</span>
                              <span className="block text-xs text-ink-subtle">
                                {[r.mode && (MODE_LABEL[r.mode] ?? r.mode), r.reference, r.createdByLabel].filter(Boolean).join(' · ')}
                                {href ? <> · <Link href={href} className="hover:underline">source</Link></> : null}
                              </span>
                            </TD>
                            <TD className="text-sm">
                              {r.counter.length ? r.counter.map((c) => <span key={c.accountId} className="block">{name(c.accountId)}</span>) : <span className="text-ink-subtle">Contra</span>}
                            </TD>
                            <TD className="text-sm">
                              {[...new Set(r.cashLines.map((l) => l.accountId))].map((id) => <span key={id} className="block">{name(id)}</span>)}
                            </TD>
                            <TD align="right" className="text-ink">{r.paidMinor ? money(r.paidMinor) : '—'}</TD>
                            <TD align="right" className="text-ink">{r.receivedMinor ? money(r.receivedMinor) : '—'}</TD>
                            <TD>
                              {r.expenseId && canAttach ? (
                                <AttachmentUpload
                                  url={`/api/v1/finance/expenses/${r.expenseId}/receipt`}
                                  current={r.attachment?.name}
                                  downloadUrl={r.attachment?.downloadUrl}
                                />
                              ) : r.attachment ? (
                                <a href={r.attachment.downloadUrl} className="text-sm text-[var(--brand-600)] hover:underline">{r.attachment.name}</a>
                              ) : r.hasReceipt ? <Badge tone="neutral">On file</Badge> : '—'}
                            </TD>
                          </TR>
                        )
                      }),
                    ]
                  })}
                </TBody>
              </Table>
            </TableWrap>
          )}
          <Pagination total={book.total} page={book.page} pageSize={book.pageSize} label="vouchers" />
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader><CardTitle>By account head</CardTitle></CardHeader>
          <CardContent className="p-0">
            {book.heads.length === 0 ? <EmptyState title="Nothing to summarise" /> : (
              <TableWrap>
                <Table>
                  <THead><tr><TH>Account head</TH><TH align="right">Vouchers</TH><TH align="right">Paid</TH><TH align="right">Received</TH></tr></THead>
                  <TBody>
                    {book.heads.map((h) => (
                      <TR key={h.accountId}>
                        <TD>
                          <Link href={`/accounts/day-book?${new URLSearchParams({ ...query, head: h.accountId })}`} className="hover:underline">{name(h.accountId)}</Link>
                        </TD>
                        <TD align="right">{h.vouchers}</TD>
                        <TD align="right">{h.paidMinor ? money(h.paidMinor) : '—'}</TD>
                        <TD align="right">{h.receivedMinor ? money(h.receivedMinor) : '—'}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableWrap>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader><CardTitle>Cash and bank reconciliation</CardTitle></CardHeader>
          <CardContent className="p-0">
            {rec.accounts.length === 0 ? <EmptyState title="No cash or bank ledgers yet" /> : (
              <TableWrap>
                <Table>
                  <THead><tr><TH>Ledger</TH><TH align="right">Opening</TH><TH align="right">In</TH><TH align="right">Out</TH><TH align="right">Closing</TH><TH /></tr></THead>
                  <TBody>
                    {rec.accounts.map((a) => (
                      <TR key={a.accountId}>
                        <TD>{a.code} · {a.name}</TD>
                        <TD align="right">{money(a.openingMinor)}{a.openingMinor < 0 ? ' Cr' : ''}</TD>
                        <TD align="right">{money(a.registerDebitMinor)}</TD>
                        <TD align="right">{money(a.registerCreditMinor)}</TD>
                        <TD align="right" className="text-ink">{money(a.closingMinor)}{a.closingMinor < 0 ? ' Cr' : ''}</TD>
                        <TD>{rec.truncated ? <Badge tone="neutral">Range too large</Badge> : a.matches ? <Badge tone="success">Matches ledger</Badge> : <Badge tone="danger">Ledger {money(a.ledgerClosingMinor)}</Badge>}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableWrap>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader><CardTitle>Expense postings</CardTitle></CardHeader>
        <CardContent className={rec.expenseIssues.length ? 'p-0' : undefined}>
          {!rec.autoPostExpenses ? (
            <Notice tone="warning">Automatic expense posting is switched off in posting rules, so expenses are not reaching the books.</Notice>
          ) : null}
          {rec.expenseIssues.length === 0 ? (
            <p className="text-sm text-ink-muted">Every expense dated in this range has a matching journal entry.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                <p className="text-sm text-ink-muted">These expenses are missing from the books or differ from their journal entry.</p>
                {canRepair && rec.autoPostExpenses ? (
                  <RepairPostingsButton from={book.range.from} to={book.range.to} count={rec.expenseIssues.length} />
                ) : null}
              </div>
              <TableWrap>
                <Table>
                  <THead><tr><TH>Expense</TH><TH>Date</TH><TH align="right">Amount</TH><TH>Problem</TH></tr></THead>
                  <TBody>
                    {rec.expenseIssues.slice(0, 50).map((i) => (
                      <TR key={i.expenseId}>
                        <TD>
                          <span className="block font-medium text-ink">{i.title}</span>
                          {i.voucherNumber ? <span className="block text-xs text-ink-subtle">{i.voucherNumber}</span> : null}
                        </TD>
                        <TD>{day(i.expenseDate)}</TD>
                        <TD align="right">{money(i.amountMinor)}</TD>
                        <TD className="text-sm">{i.message}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableWrap>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
