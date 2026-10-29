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
import { journalApprovalFor } from '@/server/modules/accounting/journal-approval-service'
import { JOURNAL_STATUS_LABEL, stagesInUse } from '@/server/modules/accounting/journal-approval'
import { JournalActionButton } from '@/components/accounting/journal-approval-forms'
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
  const approval = await journalApprovalFor(ctx, entry)
  const chain = stagesInUse(approval.departmentStage)
  const stageAt = chain.findIndex((s) => s.status === entry.approvalStatus)
  const isFinal = stageAt === chain.length - 1
  const approved = entry.approvalStatus === 'APPROVED'

  return (
    <div className="space-y-4">
      <PageHeader
        title={entry.number}
        description={`${TYPE_LABEL[entry.voucherType]} · ${formatDay(entry.date, 'd MMMM yyyy')}`}
        actions={
          <div className="flex items-center gap-2">
            {approval.actions.map((a) => (
              <JournalActionButton
                key={a}
                entryId={entry.id}
                action={a}
                expectedStatus={entry.approvalStatus}
                finalStage={isFinal}
                variant={a === 'return' ? 'secondary' : 'primary'}
                label={a === 'approve' ? (isFinal ? 'Owner approve' : stageAt === 0 ? 'Check and pass' : 'Approve') : a === 'return' ? 'Return to maker' : 'Resubmit'}
              />
            ))}
            {canReverse ? <ReverseJournalDialog id={entry.id} /> : null}
            <BackButton fallbackHref="/accounts/journals" />
          </div>
        }
      />
      <AccountsTabs active="/accounts/journals" />

      {!approved ? (
        <Notice
          tone={entry.approvalStatus === 'VOID' ? 'info' : 'warning'}
          title={entry.approvalStatus === 'VOID' ? 'Withdrawn before approval' : JOURNAL_STATUS_LABEL[entry.approvalStatus]}
        >
          {entry.approvalStatus === 'VOID'
            ? 'The source was changed or cancelled before final approval, so this entry never counted in the books.'
            : entry.approvalStatus === 'RETURNED'
              ? 'Returned to the maker. It shows only in the Trial balance pending columns until it is resubmitted and approved.'
              : `Waiting for approval (stage ${stageAt + 2} of ${chain.length + 1}). It shows in the Trial balance pending columns and stays out of Profit & loss and the Balance sheet until the Owner approves it.`}
        </Notice>
      ) : approval.steps.length ? (
        <Notice tone="success" title="Approved">
          Final approval by {approval.steps.findLast((s) => s.action === 'APPROVE_OWNER')?.actorLabel ?? '—'}
          {entry.approvedAt ? ` on ${entry.approvedAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}` : ''}.
        </Notice>
      ) : null}
      {approval.blockedReason ? (
        <Notice tone="warning" title="You cannot approve this stage">
          {approval.blockedReason}.{' '}
          {approval.otherSigners.length
            ? `It can be approved by ${approval.otherSigners.join(', ')}.`
            : 'Nobody else in the school holds this stage’s authority yet: give another user that permission (Settings → Roles).'}
        </Notice>
      ) : null}

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

      {approval.steps.length ? (
        <Card className="overflow-hidden">
          <TableWrap>
            <Table>
              <THead><tr><TH>When</TH><TH>Step</TH><TH>By</TH><TH>Remarks</TH></tr></THead>
              <TBody>
                {approval.steps.map((s) => (
                  <TR key={s.id}>
                    <TD className="whitespace-nowrap text-sm">{s.createdAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}</TD>
                    <TD className="text-sm">{JOURNAL_STATUS_LABEL[s.fromStatus]} → {JOURNAL_STATUS_LABEL[s.toStatus]}</TD>
                    <TD className="text-sm">{s.actorLabel ?? '—'}</TD>
                    <TD className="text-sm whitespace-pre-line">{s.remarks ?? '—'}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        </Card>
      ) : null}
    </div>
  )
}
