import Link from 'next/link'
import { requireContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { BackButton } from '@/components/back-button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Notice } from '@/components/ui/states'
import { Table, TableWrap, THead, TH, TBody, TR, TD } from '@/components/ui/table'
import { formatDay } from '@/lib/dates'
import { getJournal } from '@/server/modules/accounts/service'
import { AccountsTabs, moneyFmt, SOURCE_LABEL, sourceHref } from '../../ui'
import { ReverseJournalDialog } from './reverse-dialog'

export const metadata = { title: 'Voucher' }

const TYPE_LABEL: Record<string, string> = { JOURNAL: 'Journal voucher', RECEIPT: 'Receipt voucher', PAYMENT: 'Payment voucher', CONTRA: 'Contra voucher' }

export default async function JournalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext('accounts.view')
  const { id } = await params
  const { entry, reversal, original } = await getJournal(ctx, id)
  const { money } = moneyFmt(ctx.tenant.currency || 'INR')
  const href = sourceHref(entry.sourceType, entry.sourceId)
  const canReverse = ctx.can('accounts.manage') && entry.sourceType === 'MANUAL' && !entry.isReversal && !entry.reversedAt

  return (
    <div className="space-y-4">
      <PageHeader
        title={entry.number}
        description={`${TYPE_LABEL[entry.voucherType]} · ${formatDay(entry.date, 'd MMMM yyyy')}`}
        actions={
          <div className="flex items-center gap-2">
            {canReverse ? <ReverseJournalDialog id={entry.id} /> : null}
            <BackButton fallbackHref="/accounts/journals" />
          </div>
        }
      />
      <AccountsTabs active="/accounts/journals" />

      {reversal ? (
        <Notice tone="warning" title="This voucher has been reversed">
          Reversed by <Link className="underline" href={`/accounts/journals/${reversal.id}`}>{reversal.number}</Link>.
          {entry.sourceType !== 'MANUAL' ? ' The source document was cancelled or corrected.' : ''}
        </Notice>
      ) : null}
      {original ? (
        <Notice tone="info" title="Reversal entry">
          Reverses <Link className="underline" href={`/accounts/journals/${original.id}`}>{original.number}</Link>.
        </Notice>
      ) : null}

      <Card className="p-4">
        <dl className="grid gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-ink-muted">Source</dt>
            <dd className="font-medium">{SOURCE_LABEL[entry.sourceType]}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Reference</dt>
            <dd className="font-medium">
              {entry.reference ? (href ? <Link className="text-[var(--brand-600)] hover:underline" href={href}>{entry.reference}</Link> : entry.reference) : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-ink-muted">Posted by</dt>
            <dd className="font-medium">{entry.createdByLabel ?? 'System'}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Posted at</dt>
            <dd className="font-medium">{entry.createdAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</dd>
          </div>
        </dl>
        {entry.narration ? <p className="mt-3 text-sm"><span className="text-ink-muted">Narration: </span>{entry.narration}</p> : null}
      </Card>

      <Card className="overflow-hidden">
        <TableWrap>
          <Table>
            <THead>
              <tr>
                <TH>Account</TH>
                <TH>Note</TH>
                <TH align="right">Debit</TH>
                <TH align="right">Credit</TH>
              </tr>
            </THead>
            <TBody>
              {entry.lines.map((l) => (
                <TR key={l.id}>
                  <TD className={l.creditMinor > 0 ? 'pl-8' : undefined}>
                    <Link href={`/accounts/ledger?account=${l.account.id}`} className="font-medium text-ink hover:text-[var(--brand-600)]">
                      {l.creditMinor > 0 ? 'To ' : ''}{l.account.code} · {l.account.name}
                    </Link>
                  </TD>
                  <TD className="text-sm text-ink-muted">{l.memo ?? ''}</TD>
                  <TD align="right">{l.debitMinor ? money(l.debitMinor) : ''}</TD>
                  <TD align="right">{l.creditMinor ? money(l.creditMinor) : ''}</TD>
                </TR>
              ))}
              <tr className="border-t-2 border-line-strong font-semibold">
                <td colSpan={2} className="px-3 py-2">Total</td>
                <td className="px-3 py-2 text-right tnum">{money(entry.totalMinor)}</td>
                <td className="px-3 py-2 text-right tnum">{money(entry.totalMinor)}</td>
              </tr>
            </TBody>
          </Table>
        </TableWrap>
      </Card>
      {entry.isReversal ? <Badge tone="warning">Reversal entry</Badge> : null}
    </div>
  )
}
