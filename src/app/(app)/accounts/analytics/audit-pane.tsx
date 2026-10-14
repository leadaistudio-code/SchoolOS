import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { Pagination } from '@/components/pagination'
import { Table, TableWrap, THead, TH, TBody, TR, TD } from '@/components/ui/table'
import type { DrillResult } from '@/server/modules/accounting/analytics-service'

export function stamp(d: Date | null) {
  if (!d) return 'never'
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(d)
}

/** What a chart figure is made of: definition, freshness, a live reconciliation and the transactions. */
export function AuditPane({ result, money, closeHref }: { result: DrillResult; money: (minor: number) => string; closeHref: string }) {
  const signed = (minor: number) => (minor < 0 ? `(${money(minor)})` : money(minor))
  const ledger = result.drill.metric === 'cash_flow' || result.drill.metric === 'expense'
  return (
    <Card id="audit" className="overflow-hidden border-[var(--brand-600)] scroll-mt-20">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">Audit · {result.definition.name}</p>
            <CardTitle className="mt-1">{result.title}</CardTitle>
          </div>
          <Link href={closeHref} scroll={false} className="text-sm font-medium text-[var(--brand-600)] hover:underline">Close</Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <dt className="text-ink-subtle">Value shown</dt>
            <dd className="text-lg font-semibold tnum text-ink">{signed(result.valueMinor)}</dd>
            <dd className="text-xs text-ink-subtle">{result.valueLabel}</dd>
          </div>
          <div>
            <dt className="text-ink-subtle">Selected period</dt>
            <dd className="font-medium text-ink">{result.periodLabel}</dd>
          </div>
          <div>
            <dt className="text-ink-subtle">Data as of</dt>
            <dd className="font-medium text-ink">{stamp(result.freshAt)}</dd>
            <dd className="text-xs text-ink-subtle">{result.freshNote}</dd>
          </div>
          <div>
            <dt className="text-ink-subtle">Transactions</dt>
            <dd className="font-medium text-ink tnum">{result.total}</dd>
            <dd className="text-xs text-ink-subtle">{ledger ? 'journal lines' : result.drill.metric === 'aging' ? 'fee invoices' : 'assets'}</dd>
          </div>
        </dl>

        <div className="grid gap-3 text-sm lg:grid-cols-3">
          <div className="rounded-[var(--radius-sm)] bg-surface-2 p-3">
            <p className="font-medium text-ink">Calculation</p>
            <p className="mt-1 text-ink-muted">{result.definition.formula}</p>
          </div>
          <div className="rounded-[var(--radius-sm)] bg-surface-2 p-3">
            <p className="font-medium text-ink">Included</p>
            <p className="mt-1 text-ink-muted">{result.definition.included}</p>
          </div>
          <div className="rounded-[var(--radius-sm)] bg-surface-2 p-3">
            <p className="font-medium text-ink">Excluded</p>
            <p className="mt-1 text-ink-muted">{result.definition.excluded}</p>
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-ink">Reconciliation</p>
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Check</TH>
                  <TH align="right">Figure</TH>
                  <TH align="right">Recomputed</TH>
                  <TH>Result</TH>
                </tr>
              </THead>
              <TBody>
                {result.reconciliation.map((r) => (
                  <TR key={r.label}>
                    <TD>
                      {r.label}
                      {r.note ? <span className="block text-xs text-ink-subtle">{r.note}</span> : null}
                    </TD>
                    <TD align="right" className="tnum">{signed(r.summaryMinor)}</TD>
                    <TD align="right" className="tnum">{signed(r.recomputedMinor)}</TD>
                    <TD>
                      {r.matches ? (
                        <Badge tone="success">Matches</Badge>
                      ) : (
                        <Badge tone="danger">Differs by {signed(r.recomputedMinor - r.summaryMinor)}</Badge>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        </div>

        <div className="-mx-6 border-t border-line">
          {result.rows.length === 0 ? (
            <EmptyState title="No transactions" description="Nothing in this selection for the period." />
          ) : (
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <TH>{ledger ? 'Voucher' : result.drill.metric === 'aging' ? 'Invoice' : 'Asset'}</TH>
                    <TH>{ledger ? 'Date' : result.drill.metric === 'aging' ? 'Due on' : 'Capitalised'}</TH>
                    <TH>Details</TH>
                    {ledger ? (
                      <>
                        <TH align="right">Debit</TH>
                        <TH align="right">Credit</TH>
                      </>
                    ) : (
                      <TH align="right">{result.drill.metric === 'aging' ? 'Balance' : 'WDV'}</TH>
                    )}
                  </tr>
                </THead>
                <TBody>
                  {result.rows.map((r) => (
                    <TR key={r.id}>
                      <TD className="whitespace-nowrap">
                        {r.href ? (
                          <Link href={r.href} className="font-medium text-[var(--brand-600)] hover:underline">{r.ref}</Link>
                        ) : (
                          r.ref
                        )}
                      </TD>
                      <TD className="whitespace-nowrap tnum">{r.date ?? '—'}</TD>
                      <TD className="text-sm">
                        {r.description}
                        {r.detail ? <span className="block text-xs text-ink-subtle">{r.detail}</span> : null}
                        {r.figures ? (
                          <span className="block text-xs text-ink-subtle">{r.figures.map((f) => `${f.label} ${money(f.minor)}`).join(' · ')}</span>
                        ) : null}
                      </TD>
                      {ledger ? (
                        <>
                          <TD align="right" className="tnum">{r.debitMinor ? money(r.debitMinor) : ''}</TD>
                          <TD align="right" className="tnum">{r.creditMinor ? money(r.creditMinor) : ''}</TD>
                        </>
                      ) : (
                        <TD align="right" className="tnum">{signed(r.amountMinor)}</TD>
                      )}
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          )}
          <Pagination total={result.total} page={result.page} pageSize={result.pageSize} label={ledger ? 'lines' : result.drill.metric === 'aging' ? 'invoices' : 'assets'} />
        </div>
      </CardContent>
    </Card>
  )
}
