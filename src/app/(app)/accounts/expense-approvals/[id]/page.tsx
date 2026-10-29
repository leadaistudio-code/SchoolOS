import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requireContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState, Notice } from '@/components/ui/states'
import { Table, TableWrap, THead, TH, TBody, TR, TD } from '@/components/ui/table'
import { AttachmentUpload } from '@/components/accounting/payables-forms'
import { ApprovalActionButton, EditRequestDialog } from '@/components/accounting/expense-approval-forms'
import { formatDay } from '@/lib/dates'
import { paymentModeLabel } from '@/lib/finance/expense-options'
import { ApiException } from '@/server/api/response'
import { getAccountingFlags } from '@/server/modules/accounting/service'
import { cashBankAccounts } from '@/server/modules/accounting/cash-bank'
import { toIsoDay } from '@/server/modules/accounting/fiscal-year'
import { canSeeApprovals, getExpenseRequest } from '@/server/modules/accounting/expense-approval-service'
import { APPROVAL_STAGES, STAGE_ROLE, STATUS_LABEL, stageNumber, type ApprovalStatus } from '@/server/modules/accounting/expense-approval'
import { APPROVAL_TONE, AccountsTabs, moneyFmt } from '../../ui'

export const metadata = { title: 'Expense approval' }

const STEP_LABEL: Record<string, string> = {
  EDIT: 'Edited',
  SUBMIT: 'Submitted',
  VALIDATE: 'Validated (stage 2)',
  APPROVE_L1: 'Approved L1 (stage 3)',
  APPROVE_L2: 'Approved L2 (stage 4)',
  APPROVE_FINAL: 'Final approval and posted (stage 5)',
  RETURN: 'Returned for correction',
  REJECT: 'Rejected',
  WITHDRAW: 'Withdrawn',
  REVERSE: 'Reversed',
}

const ACTION_LABEL = {
  submit: 'Submit for approval',
  approve: 'Approve',
  return: 'Return to preparer',
  reject: 'Reject',
  withdraw: 'Withdraw',
  reverse: 'Reverse posted expense',
} as const

export default async function ExpenseApprovalPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext()
  if (!canSeeApprovals(ctx)) redirect('/403')
  const showTabs = ctx.can('accounts.view')
  const flags = await getAccountingFlags(ctx.db)
  if (!flags.module) {
    return (
      <div className="space-y-4">
        <PageHeader title="Expense approval" />
        {showTabs ? <AccountsTabs active="/accounts/expense-approvals" /> : null}
        <Notice tone="info" title="Not enabled">Accounting is switched off for this school.</Notice>
      </div>
    )
  }
  const { id } = await params
  const data = await getExpenseRequest(ctx, id).catch((e: unknown) => {
    if (e instanceof ApiException && e.status === 404) return null
    throw e
  })
  if (!data) notFound()
  const { request: r } = data
  const { money } = moneyFmt(ctx.tenant.currency || 'INR')
  const status = r.status as ApprovalStatus
  const current = stageNumber(status)
  const cycleSteps = data.steps.filter((s) => s.cycle === r.cycle)
  const signer = (action: string) => cycleSteps.findLast((s) => s.action === action)
  const submitted = signer('SUBMIT')
  const [heads, cash] = data.canEdit
    ? await Promise.all([
        ctx.db.expenseHead.findMany({ where: { isActive: true }, orderBy: [{ nature: 'asc' }, { name: 'asc' }], select: { id: true, name: true, isActive: true } }),
        cashBankAccounts(ctx.db),
      ])
    : [[], []]
  const receiptHref = r.receiptKey ? `/api/v1/files/${encodeURIComponent(r.receiptKey)}` : undefined
  const canAttach = data.canEdit || (status === 'SUBMITTED' && r.createdById === ctx.user.userId && ctx.can('expenses.manage'))

  const tracker = [
    {
      stage: 1,
      label: 'Maker (prepares and submits)',
      done: !!submitted && status !== 'RETURNED' && status !== 'DRAFT',
      by: submitted ? `${submitted.actorLabel ?? '—'} · ${formatDay(submitted.createdAt)}` : r.createdByLabel ?? '—',
    },
    ...APPROVAL_STAGES.filter((s) => s.stage !== 3 || data.departmentStage || !!signer(s.signature) || status === 'PENDING_L1').map((s) => {
      const signed = signer(s.signature)
      return { stage: s.stage, label: s.label, done: !!signed, by: signed ? `${signed.actorLabel ?? '—'} · ${formatDay(signed.createdAt)}` : null }
    }),
  ]

  const details: [string, React.ReactNode][] = [
    ['Expense head', data.head ? `${data.head.name}${data.head.isActive ? '' : ' (switched off)'}` : '—'],
    ['Voucher date', formatDay(r.expenseDate)],
    ['Payee / vendor', r.vendor || '—'],
    ['Payment mode', paymentModeLabel(r.paymentMode)],
    ['Paid from', data.cash ? `${data.cash.code} · ${data.cash.name}` : 'Default for the mode'],
    ['Reference', r.referenceNo || '—'],
    ['Prepared by', r.createdByLabel ?? '—'],
    ['Submission', r.cycle > 1 ? `Resubmission ${r.cycle - 1}` : 'First submission'],
  ]

  return (
    <div className="space-y-4">
      <PageHeader
        title={r.title}
        description={`${r.number} · ${money(r.amountMinor)}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {data.canEdit ? (
              <EditRequestDialog
                value={{
                  id: r.id, title: r.title, headId: r.headId, amountMinor: r.amountMinor, expenseDate: toIsoDay(r.expenseDate),
                  paymentMode: r.paymentMode, vendor: r.vendor, referenceNo: r.referenceNo, notes: r.notes, cashAccountId: r.cashAccountId,
                }}
                heads={heads.filter((h) => h.isActive).map((h) => ({ id: h.id, label: h.name }))}
                cashAccounts={cash.filter((c) => c.isActive).map((c) => ({ id: c.id, label: `${c.code} · ${c.name}` }))}
              />
            ) : null}
            {data.actions.map((a) => (
              <ApprovalActionButton
                key={a}
                requestId={r.id}
                action={a}
                label={a === 'approve' && current ? (current === 2 ? 'Check and pass' : current === 5 ? 'Owner approve and post' : 'Approve') : ACTION_LABEL[a]}
                expectedStatus={r.status}
                finalStage={current === 5}
                variant={a === 'approve' || a === 'submit' ? 'primary' : a === 'reject' || a === 'reverse' ? 'danger' : 'secondary'}
              />
            ))}
          </div>
        }
      />
      {showTabs ? <AccountsTabs active="/accounts/expense-approvals" /> : null}
      <p className="text-sm"><Link href="/accounts/expense-approvals" className="text-[var(--brand-600)] hover:underline">← Expense approvals</Link></p>

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={APPROVAL_TONE[status]}>{STATUS_LABEL[status]}</Badge>
        {current ? <span className="text-sm text-ink-muted">{STAGE_ROLE[current as 1 | 2 | 3 | 4 | 5]} stage</span> : null}
      </div>

      {status === 'RETURNED' && r.createdById === ctx.user.userId ? (
        <Notice tone="info" title="Returned to you">Correct it if needed and submit again. It will restart at validation.</Notice>
      ) : null}
      {data.stage && r.createdById === ctx.user.userId ? (
        <Notice tone="info">You prepared this expense, so other people must sign each approval stage.</Notice>
      ) : null}
      {data.blockedReason && r.createdById !== ctx.user.userId ? (
        <Notice tone="warning" title="You cannot approve this stage">
          You already signed an earlier stage of this submission, and one person cannot sign two stages of the same expense.{' '}
          {data.otherSigners.length
            ? `It can be approved by ${data.otherSigners.join(', ')}.`
            : 'Nobody else in the school holds this stage’s authority yet: give another user that permission (Settings → Roles), or return it so a different person validates it.'}
        </Notice>
      ) : null}
      {data.mode === 'off' && (status === 'DRAFT' || status === 'RETURNED') ? (
        <Notice tone="warning" title="Approval workflow is off">This expense cannot be submitted while the workflow is switched off. Withdraw it and record the expense directly.</Notice>
      ) : null}

      <Card>
        <CardHeader><CardTitle>Approval stages</CardTitle></CardHeader>
        <CardContent>
          <ol className={`grid gap-3 ${tracker.length === 5 ? 'sm:grid-cols-5' : 'sm:grid-cols-4'}`}>
            {tracker.map((t) => {
              const isCurrent = current === t.stage && !['POSTED', 'REVERSED', 'REJECTED', 'WITHDRAWN'].includes(status)
              return (
                <li
                  key={t.stage}
                  className={`rounded-lg border p-3 text-sm ${t.done ? 'border-[color-mix(in_srgb,var(--success)_40%,transparent)] bg-success-bg' : isCurrent ? 'border-[var(--brand-600)]' : 'border-line'}`}
                >
                  <span className="block text-xs text-ink-subtle">{STAGE_ROLE[t.stage as 1 | 2 | 3 | 4 | 5]}</span>
                  <span className="block font-medium text-ink">{t.label}</span>
                  <span className="mt-1 block text-xs text-ink-muted">{t.done ? t.by : isCurrent ? 'Waiting here' : t.stage === 1 ? t.by : '—'}</span>
                </li>
              )
            })}
          </ol>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
              {details.map(([k, v]) => [
                <dt key={`${k}-k`} className="text-ink-muted">{k}</dt>,
                <dd key={`${k}-v`} className="text-ink">{v}</dd>,
              ])}
              <dt className="text-ink-muted">Bill / receipt</dt>
              <dd>
                {canAttach ? (
                  <AttachmentUpload url={`/api/v1/accounting/expense-approvals/${r.id}/receipt`} current={r.receiptName} downloadUrl={receiptHref} />
                ) : receiptHref ? (
                  <a href={receiptHref} className="text-[var(--brand-600)] hover:underline">{r.receiptName ?? 'View'}</a>
                ) : '—'}
              </dd>
            </dl>
            {r.notes ? <p className="mt-3 text-sm text-ink-muted whitespace-pre-line">{r.notes}</p> : null}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader><CardTitle>In the books</CardTitle></CardHeader>
          <CardContent className="p-0">
            {data.entries.length === 0 ? (
              <EmptyState
                title="Not posted"
                description={status === 'REJECTED' || status === 'WITHDRAWN' ? 'Nothing was posted.' : 'It is posted only at final approval. Until then it does not change any ledger balance.'}
              />
            ) : (
              <TableWrap>
                <Table>
                  <THead><tr><TH>Entry</TH><TH>Date</TH><TH align="right">Amount</TH></tr></THead>
                  <TBody>
                    {data.entries.map((e) => (
                      <TR key={e.id}>
                        <TD>
                          <Link href={`/accounts/journals/${e.id}`} className="text-[var(--brand-600)] hover:underline">{e.number}</Link>
                          {e.isReversal ? <span className="block text-xs text-ink-subtle">reversal</span> : e.reversedAt ? <span className="block text-xs text-ink-subtle">reversed</span> : null}
                        </TD>
                        <TD>{formatDay(e.date)}</TD>
                        <TD align="right">{money(e.totalMinor)}</TD>
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
        <CardHeader><CardTitle>History</CardTitle></CardHeader>
        <CardContent className="p-0">
          <TableWrap>
            <Table>
              <THead><tr><TH>When</TH><TH>Action</TH><TH>By</TH><TH>Status</TH><TH>Remarks</TH></tr></THead>
              <TBody>
                {data.steps.map((s) => (
                  <TR key={s.id}>
                    <TD className="text-sm whitespace-nowrap">{s.createdAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}</TD>
                    <TD className="text-sm">{STEP_LABEL[s.action] ?? s.action}{s.cycle > 1 ? <span className="block text-xs text-ink-subtle">submission {s.cycle}</span> : null}</TD>
                    <TD className="text-sm">{s.actorLabel ?? '—'}</TD>
                    <TD className="text-xs text-ink-muted">
                      {s.fromStatus === s.toStatus ? STATUS_LABEL[s.toStatus as ApprovalStatus] : `${STATUS_LABEL[s.fromStatus as ApprovalStatus]} → ${STATUS_LABEL[s.toStatus as ApprovalStatus]}`}
                    </TD>
                    <TD className="text-sm whitespace-pre-line">{s.remarks ?? '—'}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        </CardContent>
      </Card>
    </div>
  )
}
