import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PackagePlus } from 'lucide-react'
import { requireContext } from '@/server/context'
import { buttonVariants } from '@/components/ui/button-variants'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState, Notice } from '@/components/ui/states'
import { Metric, MetricRow } from '@/components/ui/metric'
import { Table, TableWrap, THead, TH, TBody, TR, TD } from '@/components/ui/table'
import {
  AttachmentUpload,
  DebitNoteDialog,
  DocumentAction,
  PurchaseVoucherDialog,
  VendorAdjustmentDialog,
  VendorDialog,
  VendorPaymentDialog,
} from '@/components/accounting/payables-forms'
import { formatDay } from '@/lib/dates'
import { getAccountingFlags } from '@/server/modules/accounting/service'
import { getVendor360, vendorLedgerFrom } from '@/server/modules/accounting/payables-service'
import { ageBills, PAYABLE_AGEING_BUCKETS } from '@/server/modules/accounting/payables'
import { toIsoDay } from '@/server/modules/accounting/fiscal-year'
import { schoolToday } from '@/lib/periods'
import { moneyFmt } from '../../ui'

export const metadata = { title: 'Vendor 360' }

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral' | 'info'> = {
  POSTED: 'success',
  APPROVED: 'success',
  DRAFT: 'neutral',
  SUBMITTED: 'warning',
  REJECTED: 'danger',
  CANCELLED: 'neutral',
}

export default async function Vendor360Page({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext('accounts.view')
  const flags = await getAccountingFlags(ctx.db)
  if (!flags.module) {
    return (
      <div className="space-y-4">
        <PageHeader title="Vendor" />
        <Notice tone="info" title="Not enabled">Vendor accounting is switched off for this school.</Notice>
      </div>
    )
  }
  const { id } = await params
  const vendor360 = await getVendor360(ctx, id).catch((error: { status?: number }) => {
    if (error?.status === 404) notFound()
    throw error
  })
  const { vendor, summary, vouchers, payments, debitNotes, adjustments } = vendor360
  const { money } = moneyFmt(ctx.tenant.currency || 'INR')
  const ageing = ageBills(summary.bills, schoolToday())
  const ledger = vendorLedgerFrom(vendor360)
  const storePurchases = ctx.can('store.view')
    ? await ctx.db.storePurchase.findMany({
        where: { vendorId: vendor.id },
        orderBy: [{ purchaseDate: 'desc' }, { number: 'desc' }],
        take: 50,
        include: { lines: { include: { item: { select: { name: true } } } } },
      })
    : []
  const canManage = ctx.can('accounts.manage')
  const canReceiveStock = vendor.isActive && ctx.can('store.manage')
  const me = ctx.user.userId

  const accounts = canManage
    ? (await ctx.db.ledgerAccount.findMany({
        where: { isActive: true, type: { in: ['EXPENSE', 'ASSET'] } },
        orderBy: [{ type: 'desc' }, { code: 'asc' }],
        select: { id: true, code: true, name: true, systemKey: true },
      }))
        .filter((a) => !['CASH', 'BANK', 'STORE_STOCK'].includes(a.systemKey ?? ''))
        .map((a) => ({ id: a.id, label: `${a.code} · ${a.name}` }))
    : []

  const numberOf = new Map(vouchers.map((v) => [v.id, v.number]))
  const activeReturnLines = debitNotes.filter((n) => n.status === 'SUBMITTED' || n.status === 'APPROVED').flatMap((n) => n.lines)
  const openBills = summary.bills
    .filter((b) => b.reducibleMinor > 0)
    .map((b) => ({ voucherId: b.voucherId, number: b.number, supplierInvoiceNo: b.supplierInvoiceNo, dueDate: b.dueDate, reducibleMinor: b.reducibleMinor }))

  return (
    <div className="space-y-4">
      <PageHeader
        title={vendor.name}
        breadcrumbs={[{ label: 'Accounts', href: '/accounts' }, { label: 'Vendors', href: '/accounts/vendors' }, { label: vendor.code }]}
        description={[vendor.code, vendor.gstin && `GSTIN ${vendor.gstin}`, vendor.pan && `PAN ${vendor.pan}`, vendor.creditDays ? `${vendor.creditDays}-day terms` : 'Immediate payment'].filter(Boolean).join(' · ')}
        actions={
          canManage || canReceiveStock ? (
            <div className="flex flex-wrap gap-2">
              {canReceiveStock ? (
                <Link
                  href={`/inventory/store/purchases/new?vendorId=${vendor.id}`}
                  className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                >
                  <PackagePlus className="size-3.5" aria-hidden />
                  Receive stock
                </Link>
              ) : null}
              {canManage ? (
                <>
                  <VendorDialog label="Edit" vendor={vendor} />
                  {vendor.isActive ? <PurchaseVoucherDialog vendorId={vendor.id} accounts={accounts} creditDays={vendor.creditDays} /> : null}
                  <VendorPaymentDialog vendorId={vendor.id} bills={openBills} />
                </>
              ) : null}
            </div>
          ) : null
        }
      />
      {!vendor.isActive ? <Notice tone="warning">This vendor is inactive. Existing balances stay; new bills are blocked.</Notice> : null}
      {!summary.reconciled ? (
        <Notice tone="danger" title="Does not reconcile">Bill-wise balances do not agree with the vendor totals. Check documents linked to cancelled or draft bills.</Notice>
      ) : null}

      <MetricRow columns={4}>
        <Metric label="Total invoiced" value={money(summary.totalInvoicedMinor)} sub="posted purchase vouchers" />
        <Metric label="Total settled" value={money(summary.totalSettledMinor)} sub={summary.onAccountMinor ? `${money(summary.onAccountMinor)} on account` : 'payments made'} />
        <Metric label="Total debit notes" value={money(summary.totalDebitNotesMinor)} sub={summary.pendingDebitNotesMinor ? `${money(summary.pendingDebitNotesMinor)} awaiting approval` : 'approved returns'} />
        <Metric
          label="Net liability"
          value={money(summary.netLiabilityMinor)}
          sub={summary.totalAdjustmentsMinor ? `after ${money(summary.totalAdjustmentsMinor)} discounts / write-offs` : summary.netLiabilityMinor < 0 ? 'advance with vendor' : 'payable now'}
          emphasis={summary.bills.some((b) => b.overdue) ? 'warning' : undefined}
        />
      </MetricRow>

      <MetricRow columns={4}>
        {PAYABLE_AGEING_BUCKETS.map((b) => (
          <Metric key={b.key} label={`Bills ${b.label}`} value={money(ageing[b.key])} sub="by bill date" emphasis={b.key === 'd90_plus' && ageing[b.key] > 0 ? 'danger' : undefined} />
        ))}
      </MetricRow>

      <Card className="overflow-hidden">
        <CardHeader><CardTitle>Bill-wise outstanding</CardTitle></CardHeader>
        <CardContent className="p-0">
          {summary.bills.length === 0 ? (
            <EmptyState title="No posted bills" description="Posted purchase vouchers appear here with their balances." />
          ) : (
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <TH>Voucher / supplier bill</TH>
                    <TH>Bill date</TH>
                    <TH>Due</TH>
                    <TH align="right">Billed</TH>
                    <TH align="right">Paid</TH>
                    <TH align="right">Debit notes</TH>
                    <TH align="right">Adjusted</TH>
                    <TH align="right">Outstanding</TH>
                    {canManage ? <TH align="right">Actions</TH> : null}
                  </tr>
                </THead>
                <TBody>
                  {summary.bills.map((b) => {
                    const voucher = vouchers.find((v) => v.id === b.voucherId)!
                    const returnable = voucher.lines.map((l) => {
                      const prior = activeReturnLines.filter((r) => r.voucherLineId === l.id)
                      return {
                        id: l.id,
                        description: l.description,
                        quantity: l.quantity,
                        remainingQuantity: l.quantity - prior.reduce((s, r) => s + r.quantity, 0),
                        remainingMinor: l.totalMinor - prior.reduce((s, r) => s + r.totalMinor, 0),
                      }
                    })
                    return (
                      <TR key={b.voucherId}>
                        <TD>
                          <span className="block font-medium text-ink">{b.number}</span>
                          <span className="block text-xs text-ink-subtle">Bill {b.supplierInvoiceNo}</span>
                        </TD>
                        <TD className="whitespace-nowrap">{formatDay(new Date(`${b.invoiceDate}T00:00:00Z`))}</TD>
                        <TD className="whitespace-nowrap">
                          {formatDay(new Date(`${b.dueDate}T00:00:00Z`))}
                          {b.overdue ? <Badge tone="danger" className="ml-1">Overdue</Badge> : null}
                        </TD>
                        <TD align="right">{money(b.totalMinor)}</TD>
                        <TD align="right">{b.paidMinor ? money(b.paidMinor) : '—'}</TD>
                        <TD align="right">
                          {b.debitNotesMinor ? money(b.debitNotesMinor) : '—'}
                          {b.pendingDebitNotesMinor ? <span className="block text-xs text-warning">{money(b.pendingDebitNotesMinor)} pending</span> : null}
                        </TD>
                        <TD align="right">{b.adjustmentsMinor ? money(b.adjustmentsMinor) : '—'}</TD>
                        <TD align="right" className="font-medium text-ink">{money(b.outstandingMinor)}</TD>
                        {canManage ? (
                          <TD align="right">
                            <div className="flex justify-end flex-wrap gap-1">
                              <DebitNoteDialog voucherId={b.voucherId} voucherNumber={b.number} lines={returnable} approvals={flags.approvals} />
                              <VendorAdjustmentDialog voucherId={b.voucherId} voucherNumber={b.number} reducibleMinor={b.reducibleMinor} />
                            </div>
                          </TD>
                        ) : null}
                      </TR>
                    )
                  })}
                </TBody>
              </Table>
            </TableWrap>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Ledger vouchers</CardTitle>
          <span className="text-xs text-ink-subtle">Sundry Creditors · {vendor.name} · with bill-wise references</span>
        </CardHeader>
        <CardContent className="p-0">
          {ledger.length === 0 ? (
            <EmptyState title="No posted vouchers" />
          ) : (
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <TH>Date</TH>
                    <TH>Voucher</TH>
                    <TH>Bill-wise details</TH>
                    <TH align="right">Debit</TH>
                    <TH align="right">Credit</TH>
                    <TH align="right">Balance</TH>
                  </tr>
                </THead>
                <TBody>
                  {ledger.map((r) => (
                    <TR key={`${r.voucherType}:${r.id}`}>
                      <TD className="whitespace-nowrap tnum">{r.date}</TD>
                      <TD className="whitespace-nowrap">
                        <span className="block font-medium text-ink">{r.voucherNo}</span>
                        <span className="block text-xs text-ink-subtle">{r.voucherType}</span>
                      </TD>
                      <TD className="text-sm">
                        {r.refs.map((ref, i) => (
                          <span key={i} className="block">
                            <span className="font-medium">{ref.type}</span>
                            {ref.bill ? ` · ${ref.bill}` : ''} · {money(ref.amountMinor)}
                          </span>
                        ))}
                      </TD>
                      <TD align="right" className="tnum">{r.debitMinor ? money(r.debitMinor) : ''}</TD>
                      <TD align="right" className="tnum">{r.creditMinor ? money(r.creditMinor) : ''}</TD>
                      <TD align="right" className="tnum">
                        {r.balanceMinor === 0 ? '—' : `${money(r.balanceMinor)} ${r.balanceMinor > 0 ? 'Cr' : 'Dr'}`}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          )}
        </CardContent>
      </Card>

      {storePurchases.length > 0 ? (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Store purchases (goods receipts)</CardTitle>
            <span className="text-xs text-ink-subtle">Paid at receipt; not on this vendor&apos;s account</span>
          </CardHeader>
          <CardContent className="p-0">
            <TableWrap>
              <Table>
                <THead><tr><TH>Date</TH><TH>Items</TH><TH align="right">Amount</TH></tr></THead>
                <TBody>
                  {storePurchases.map((p) => (
                    <TR key={p.id}>
                      <TD className="whitespace-nowrap tnum">
                        {toIsoDay(p.purchaseDate)}
                        <Link href={`/inventory/store/purchases/${p.id}`} className="block text-xs text-[var(--brand-600)] hover:underline">
                          {p.number}
                        </Link>
                      </TD>
                      <TD className="text-sm">
                        {p.lines.map((l) => <span key={l.id} className="block">{l.quantity} × {l.item.name}</span>)}
                        {p.invoiceNo ? <span className="block text-xs text-ink-subtle">Bill {p.invoiceNo} · {p.paymentMode.toLowerCase()}</span> : null}
                      </TD>
                      <TD align="right" className="tnum">{money(p.totalMinor)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          </CardContent>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <CardHeader><CardTitle>Purchase vouchers</CardTitle></CardHeader>
        <CardContent className="p-0">
          {vouchers.length === 0 ? (
            <EmptyState title="No purchase vouchers yet" />
          ) : (
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <TH>Voucher</TH>
                    <TH>Lines</TH>
                    <TH align="right">Tax</TH>
                    <TH align="right">Total</TH>
                    <TH>Status</TH>
                    <TH>Original invoice</TH>
                    {canManage ? <TH align="right">Actions</TH> : null}
                  </tr>
                </THead>
                <TBody>
                  {vouchers.map((v) => (
                    <TR key={v.id}>
                      <TD>
                        <span className="block font-medium text-ink">{v.number}</span>
                        <span className="block text-xs text-ink-subtle">Bill {v.supplierInvoiceNo} · {formatDay(v.invoiceDate)}</span>
                      </TD>
                      <TD className="text-sm">
                        {v.lines.map((l) => <span key={l.id} className="block">{l.quantity} × {l.description}</span>)}
                      </TD>
                      <TD align="right">{v.taxMinor ? money(v.taxMinor) : '—'}</TD>
                      <TD align="right" className="text-ink">{money(v.totalMinor)}</TD>
                      <TD>
                        <Badge tone={STATUS_TONE[v.status] ?? 'neutral'}>{v.status.toLowerCase()}</Badge>
                        {v.cancelReason ? <span className="block text-xs text-ink-subtle">{v.cancelReason}</span> : null}
                      </TD>
                      <TD>
                        {canManage && v.status !== 'CANCELLED' ? (
                          <AttachmentUpload url={`/api/v1/accounting/purchase-vouchers/${v.id}/attachment`} current={v.attachmentName} />
                        ) : v.attachmentName ? (
                          <a href={`/api/v1/accounting/purchase-vouchers/${v.id}/attachment`} className="text-sm text-[var(--brand-600)] hover:underline">{v.attachmentName}</a>
                        ) : '—'}
                      </TD>
                      {canManage ? (
                        <TD align="right">
                          <div className="flex justify-end gap-1">
                            {v.status === 'DRAFT' ? <DocumentAction url={`/api/v1/accounting/purchase-vouchers/${v.id}`} action="post" label="Post" variant="secondary" /> : null}
                            {v.status !== 'CANCELLED' ? <DocumentAction url={`/api/v1/accounting/purchase-vouchers/${v.id}`} action="cancel" label="Cancel" needsReason /> : null}
                          </div>
                        </TD>
                      ) : null}
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader><CardTitle>Payments</CardTitle></CardHeader>
          <CardContent className="p-0">
            {payments.length === 0 ? <EmptyState title="No payments yet" /> : (
              <TableWrap>
                <Table>
                  <THead><tr><TH>Voucher</TH><TH>Applied to</TH><TH align="right">Amount</TH><TH>Status</TH>{canManage ? <TH /> : null}</tr></THead>
                  <TBody>
                    {payments.map((p) => {
                      const applied = p.allocations.reduce((s, a) => s + a.amountMinor, 0)
                      return (
                        <TR key={p.id}>
                          <TD>
                            <span className="block font-medium text-ink">{p.number}</span>
                            <span className="block text-xs text-ink-subtle">{formatDay(p.paidOn)} · {p.mode.toLowerCase().replace('_', ' ')}{p.reference ? ` · ${p.reference}` : ''}</span>
                          </TD>
                          <TD className="text-sm">
                            {p.allocations.map((a) => <span key={a.voucherId} className="block">{numberOf.get(a.voucherId)}: {money(a.amountMinor)}</span>)}
                            {p.amountMinor - applied > 0 ? <span className="block text-ink-subtle">On account: {money(p.amountMinor - applied)}</span> : null}
                          </TD>
                          <TD align="right" className="text-ink">{money(p.amountMinor)}</TD>
                          <TD><Badge tone={STATUS_TONE[p.status] ?? 'neutral'}>{p.status.toLowerCase()}</Badge></TD>
                          {canManage ? <TD align="right">{p.status === 'POSTED' ? <DocumentAction url={`/api/v1/accounting/vendor-payments/${p.id}`} action="cancel" label="Cancel" needsReason /> : null}</TD> : null}
                        </TR>
                      )
                    })}
                  </TBody>
                </Table>
              </TableWrap>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader><CardTitle>Debit notes, discounts and write-offs</CardTitle></CardHeader>
          <CardContent className="p-0">
            {debitNotes.length + adjustments.length === 0 ? <EmptyState title="No returns or adjustments" /> : (
              <TableWrap>
                <Table>
                  <THead><tr><TH>Document</TH><TH>Reason</TH><TH align="right">Amount</TH><TH>Status</TH>{canManage ? <TH /> : null}</tr></THead>
                  <TBody>
                    {debitNotes.map((n) => (
                      <TR key={n.id}>
                        <TD>
                          <span className="block font-medium text-ink">{n.number}</span>
                          <span className="block text-xs text-ink-subtle">Debit note · {numberOf.get(n.voucherId)} · {formatDay(n.noteDate)}</span>
                          {canManage && n.status !== 'CANCELLED' && n.status !== 'REJECTED' ? (
                            <AttachmentUpload url={`/api/v1/accounting/debit-notes/${n.id}/attachment`} current={n.attachmentName} />
                          ) : n.attachmentName ? (
                            <a href={`/api/v1/accounting/debit-notes/${n.id}/attachment`} className="text-xs text-[var(--brand-600)] hover:underline">{n.attachmentName}</a>
                          ) : null}
                        </TD>
                        <TD className="text-sm max-w-64">
                          {n.reason}
                          {n.rejectionReason ? <span className="block text-xs text-[var(--danger)]">Rejected: {n.rejectionReason}</span> : null}
                          {n.approvedByLabel ? <span className="block text-xs text-ink-subtle">Approved by {n.approvedByLabel}</span> : null}
                        </TD>
                        <TD align="right" className="text-ink">{money(n.totalMinor)}</TD>
                        <TD><Badge tone={STATUS_TONE[n.status] ?? 'neutral'}>{n.status.toLowerCase()}</Badge></TD>
                        {canManage ? (
                          <TD align="right">
                            <div className="flex justify-end gap-1">
                              {n.status === 'SUBMITTED' && n.createdById !== me ? (
                                <>
                                  <DocumentAction url={`/api/v1/accounting/debit-notes/${n.id}`} action="approve" label="Approve" variant="secondary" />
                                  <DocumentAction url={`/api/v1/accounting/debit-notes/${n.id}`} action="reject" label="Reject" needsReason />
                                </>
                              ) : null}
                              {n.status === 'SUBMITTED' || n.status === 'APPROVED' ? (
                                <DocumentAction url={`/api/v1/accounting/debit-notes/${n.id}`} action="cancel" label="Cancel" needsReason />
                              ) : null}
                            </div>
                          </TD>
                        ) : null}
                      </TR>
                    ))}
                    {adjustments.map((a) => (
                      <TR key={a.id}>
                        <TD>
                          <span className="block font-medium text-ink">{a.number}</span>
                          <span className="block text-xs text-ink-subtle">{a.type === 'DISCOUNT' ? 'Discount' : 'Write-off'} · {numberOf.get(a.voucherId)} · {formatDay(a.adjustedOn)}</span>
                        </TD>
                        <TD className="text-sm max-w-64">{a.reason}</TD>
                        <TD align="right" className="text-ink">{money(a.amountMinor)}</TD>
                        <TD><Badge tone={STATUS_TONE[a.status] ?? 'neutral'}>{a.status.toLowerCase()}</Badge></TD>
                        {canManage ? <TD align="right">{a.status === 'POSTED' ? <DocumentAction url={`/api/v1/accounting/vendor-adjustments/${a.id}`} action="cancel" label="Cancel" needsReason /> : null}</TD> : null}
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableWrap>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-ink-subtle">
        Net liability = invoiced − settled − approved debit notes − discounts and write-offs. It equals the bill-wise
        outstanding less payments held on account. <Link href="/accounts/journals" className="hover:underline">Journal entries</Link> carry
        every posting.
      </p>
    </div>
  )
}
