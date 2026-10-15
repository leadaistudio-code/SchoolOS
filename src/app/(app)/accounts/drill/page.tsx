import Link from 'next/link'
import { requireContext } from '@/server/context'
import { ApiException } from '@/server/api/response'
import { verifyDrill } from '@/server/drill/descriptor'
import { resolveDrill, type DrillView } from '@/server/drill/service'
import { PageHeader } from '@/components/page-header'
import { BackButton } from '@/components/back-button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState, Notice } from '@/components/ui/states'
import { Pagination } from '@/components/pagination'
import { Table, TableWrap, THead, TH, TBody, TR, TD } from '@/components/ui/table'
import { moneyFmt, SOURCE_LABEL, sourceHref } from '../ui'

export const metadata = { title: 'Drill down' }

export default async function DrillPage({ searchParams }: { searchParams: Promise<{ d?: string; page?: string }> }) {
  // Permission depends on the figure (accounts.view or fees.report); the resolver checks it.
  const ctx = await requireContext()
  const params = await searchParams
  const drill = verifyDrill(ctx.tenant.id, params.d)

  let view: DrillView | null = null
  let problem: string | null = drill ? null : 'This link is not valid for this school. Open the figure again from its report.'
  if (drill) {
    try {
      view = await resolveDrill(ctx, drill, Number(params.page) || 1)
    } catch (e) {
      if (!(e instanceof ApiException)) throw e
      problem = e.message
    }
  }

  if (!view) {
    return (
      <div className="space-y-4">
        <PageHeader title="Drill down" actions={<BackButton fallbackHref="/accounts" />} />
        <Notice tone="warning" title="Cannot open this figure">{problem}</Notice>
      </div>
    )
  }

  const { money, signed, drCr } = moneyFmt(ctx.tenant.currency || 'INR')
  const differs = view.check.recomputedMinor - view.check.figureMinor
  const vouchers = view.layout === 'vouchers'

  return (
    <div className="space-y-4">
      <PageHeader
        title={view.title}
        description={`${view.report} · ${view.periodLabel}`}
        actions={<BackButton fallbackHref="/accounts" />}
      />

      <Card>
        <CardContent className="space-y-4 pt-5">
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-ink-subtle">Value shown</dt>
              <dd className="text-2xl font-semibold tnum text-ink">{signed(view.valueMinor)}</dd>
              <dd className="text-xs text-ink-subtle">{view.valueLabel}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-ink-subtle">How it is derived</dt>
              <dd className="mt-1 text-ink">{view.formula}</dd>
            </div>
          </dl>

          {view.derivation.length > 0 ? (
            <table className="w-full max-w-xl text-sm">
              <tbody>
                {view.derivation.map((line, i) => (
                  <tr key={i} className={line.op === '=' ? 'border-t border-line-strong font-semibold' : ''}>
                    <td className="w-6 py-1 text-ink-subtle">{line.op}</td>
                    <td className="py-1">
                      {line.href ? (
                        <Link href={line.href} className="text-[var(--brand-600)] hover:underline">{line.label}</Link>
                      ) : (
                        line.label
                      )}
                    </td>
                    <td className="py-1 text-right tnum">{signed(line.minor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-sm)] bg-surface-2 p-3 text-sm">
            <span className="font-medium text-ink">{view.check.label}</span>
            <span className="tnum text-ink-muted">Report {signed(view.check.figureMinor)} · Listed {signed(view.check.recomputedMinor)}</span>
            {differs === 0 ? (
              <Badge tone="success">Matches</Badge>
            ) : (
              <Badge tone="danger">Differs by {signed(differs)}</Badge>
            )}
            <span className="w-full text-xs text-ink-subtle">{view.check.note}</span>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>{vouchers ? 'Vouchers' : 'Made up of'}</CardTitle>
        </CardHeader>
        {view.rows.length === 0 ? (
          <EmptyState title="Nothing to show" description="No entries make up this figure for the period." />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>{vouchers ? 'Voucher' : 'Reference'}</TH>
                  {vouchers || view.rows.some((r) => r.date) ? <TH>{view.dateLabel ?? 'Date'}</TH> : null}
                  <TH>Particulars</TH>
                  {vouchers ? (
                    <>
                      <TH align="right">Debit</TH>
                      <TH align="right">Credit</TH>
                      <TH align="right">Balance</TH>
                    </>
                  ) : (
                    <TH align="right">Amount</TH>
                  )}
                </tr>
              </THead>
              <TBody>
                {view.rows.map((r) => {
                  const href = r.href ?? (r.source ? sourceHref(r.source.type, r.source.id) : null)
                  return (
                    <TR key={r.id}>
                      <TD className="whitespace-nowrap">
                        {href ? (
                          <Link href={href} className="font-medium text-[var(--brand-600)] hover:underline">{r.ref}</Link>
                        ) : (
                          r.ref
                        )}
                      </TD>
                      {vouchers || view.rows.some((x) => x.date) ? <TD className="whitespace-nowrap tnum">{r.date ?? '—'}</TD> : null}
                      <TD className="text-sm">
                        {r.particulars}
                        {r.detail || r.source ? (
                          <span className="block text-xs text-ink-subtle">
                            {[r.source ? SOURCE_LABEL[r.source.type] ?? r.source.type : null, r.detail].filter(Boolean).join(' · ')}
                          </span>
                        ) : null}
                        {r.figures ? (
                          <span className="block text-xs text-ink-subtle">{r.figures.map((f) => `${f.label} ${money(f.minor)}`).join(' · ')}</span>
                        ) : null}
                      </TD>
                      {vouchers ? (
                        <>
                          <TD align="right" className="tnum">{r.debitMinor ? money(r.debitMinor) : ''}</TD>
                          <TD align="right" className="tnum">{r.creditMinor ? money(r.creditMinor) : ''}</TD>
                          <TD align="right" className="tnum">{drCr(r.balanceMinor ?? 0)}</TD>
                        </>
                      ) : (
                        <TD align="right" className="tnum">{signed(r.amountMinor ?? 0)}</TD>
                      )}
                    </TR>
                  )
                })}
              </TBody>
            </Table>
          </TableWrap>
        )}
        <Pagination total={view.totalRows} page={view.page} pageSize={view.pageSize} label={vouchers ? 'vouchers' : 'entries'} />
      </Card>
    </div>
  )
}
