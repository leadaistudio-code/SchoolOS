import Link from 'next/link'
import { requireContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/states'
import { Pagination } from '@/components/pagination'
import { Table, TableWrap, THead, TH, TBody, TR, TD } from '@/components/ui/table'
import { formatDay } from '@/lib/dates'
import { journalFilterSchema, listJournals } from '@/server/modules/accounts/service'
import { AccountsTabs, moneyFmt, SOURCE_LABEL, sourceHref } from '../ui'

export const metadata = { title: 'Journal entries' }

const TYPE_LABEL: Record<string, string> = { JOURNAL: 'Journal', RECEIPT: 'Receipt', PAYMENT: 'Payment', CONTRA: 'Contra' }

export default async function JournalsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireContext('accounts.view')
  const params = await searchParams
  const parsed = journalFilterSchema.safeParse(params)
  const filter = parsed.success ? parsed.data : {}
  const page = Math.max(1, Number(params.page) || 1)
  const pageSize = 50
  const { range, rows, total } = await listJournals(ctx, filter, page, pageSize)
  const { money } = moneyFmt(ctx.tenant.currency || 'INR')

  return (
    <div className="space-y-4">
      <PageHeader
        title="Journal entries"
        description="Day book of every voucher. Automatic entries come from fee receipts, refunds and expenses."
        actions={
          ctx.can('accounts.manage') ? (
            <Link href="/accounts/journals/new">
              <Button size="sm">New voucher</Button>
            </Link>
          ) : null
        }
      />
      <AccountsTabs active="/accounts/journals" />

      <Card className="p-4">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="block text-sm">
            <span className="text-ink-muted">From</span>
            <Input type="date" name="from" defaultValue={range.from} className="mt-1 w-40" />
          </label>
          <label className="block text-sm">
            <span className="text-ink-muted">To</span>
            <Input type="date" name="to" defaultValue={range.to} className="mt-1 w-40" />
          </label>
          <label className="block text-sm">
            <span className="text-ink-muted">Voucher type</span>
            <Select name="type" defaultValue={params.type ?? ''} className="mt-1 w-36">
              <option value="">All types</option>
              {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </label>
          <label className="block text-sm">
            <span className="text-ink-muted">Source</span>
            <Select name="source" defaultValue={params.source ?? ''} className="mt-1 w-36">
              <option value="">All sources</option>
              {Object.entries(SOURCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </label>
          <label className="block text-sm">
            <span className="text-ink-muted">Search</span>
            <Input name="q" defaultValue={params.q ?? ''} placeholder="Voucher, receipt or narration" className="mt-1 w-56" />
          </label>
          <Button type="submit" variant="secondary">Apply</Button>
        </form>
      </Card>

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState title="No vouchers in this period" description="Change the dates or post a journal voucher." />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Voucher</TH>
                  <TH>Date</TH>
                  <TH>Type</TH>
                  <TH>Accounts</TH>
                  <TH>Narration</TH>
                  <TH align="right">Debit</TH>
                  <TH align="right">Credit</TH>
                </tr>
              </THead>
              <TBody>
                {rows.map((e) => {
                  const href = sourceHref(e.sourceType, e.sourceId)
                  return (
                    <TR key={e.id}>
                      <TD>
                        <Link href={`/accounts/journals/${e.id}`} className="font-medium text-[var(--brand-600)] hover:underline">
                          {e.number}
                        </Link>
                        <span className="block text-xs text-ink-subtle">
                          {e.isReversal ? 'Reversal' : SOURCE_LABEL[e.sourceType]}
                          {e.reference ? (href ? <> · <Link href={href} className="hover:underline">{e.reference}</Link></> : ` · ${e.reference}`) : null}
                        </span>
                        {e.reversedAt ? <Badge tone="warning">Reversed</Badge> : null}
                      </TD>
                      <TD className="whitespace-nowrap">{formatDay(e.date)}</TD>
                      <TD>{TYPE_LABEL[e.voucherType]}</TD>
                      <TD className="text-sm">
                        {e.lines.map((l) => (
                          <span key={l.id} className={`block ${l.creditMinor > 0 ? 'pl-4 text-ink-muted' : ''}`}>
                            {l.creditMinor > 0 ? 'To ' : ''}{l.account.name}
                          </span>
                        ))}
                      </TD>
                      <TD className="max-w-72 text-sm text-ink-muted">{e.narration}</TD>
                      <TD align="right" className="text-sm">
                        {e.lines.map((l) => <span key={l.id} className="block">{l.debitMinor ? money(l.debitMinor) : '\u00a0'}</span>)}
                      </TD>
                      <TD align="right" className="text-sm">
                        {e.lines.map((l) => <span key={l.id} className="block">{l.creditMinor ? money(l.creditMinor) : '\u00a0'}</span>)}
                      </TD>
                    </TR>
                  )
                })}
              </TBody>
            </Table>
          </TableWrap>
        )}
        <Pagination total={total} page={page} pageSize={pageSize} label="vouchers" />
      </Card>
    </div>
  )
}
