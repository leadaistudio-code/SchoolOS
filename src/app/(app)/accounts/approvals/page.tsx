import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState, Notice } from '@/components/ui/states'
import { LinkTabs } from '@/components/ui/tabs'
import { DepartmentStageToggle, JournalActionButton } from '@/components/accounting/journal-approval-forms'
import { formatDay } from '@/lib/dates'
import { canSeeJournalApprovals, listJournalApprovals, SOURCE_LABEL } from '@/server/modules/accounting/journal-approval-service'
import { JOURNAL_STATUS_LABEL, stagesInUse } from '@/server/modules/accounting/journal-approval'
import { AccountsTabs, Metric, moneyFmt } from '../ui'

export const metadata = { title: 'Entry approvals' }

const VIEWS = [
  { key: 'mine', label: 'Awaiting me' },
  { key: 'pending', label: 'All pending' },
  { key: 'returned', label: 'Returned to maker' },
] as const

const STEP_LABEL: Record<string, string> = {
  APPROVE_CHECK: 'Checked',
  APPROVE_DEPARTMENT: 'Department head approved',
  APPROVE_ACCOUNTANT: 'Accountant approved',
  APPROVE_OWNER: 'Owner approved',
  RETURN: 'Returned',
  RESUBMIT: 'Resubmitted',
}

export default async function JournalApprovalsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireContext()
  if (!canSeeJournalApprovals(ctx)) redirect('/403')
  const params = await searchParams
  const view = VIEWS.some((v) => v.key === params.view) ? params.view : undefined
  const data = await listJournalApprovals(ctx, { view: view ?? 'pending' })
  const { money } = moneyFmt(ctx.tenant.currency || 'INR')
  const chain = stagesInUse(data.departmentStage)
  const pendingTotal = data.stages.reduce((t, s) => t + s.totalMinor, 0)
  const pendingCount = data.stages.reduce((t, s) => t + s.count, 0)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Entry approvals"
        description="Cost entries wait here and show only in the Trial balance's pending columns. They reach Profit & loss and the Balance sheet after the Owner's final approval."
        actions={
          <Link href="/accounts/expense-approvals" className="text-sm font-medium text-[var(--brand-600)] hover:underline">
            Expense requests →
          </Link>
        }
      />
      {ctx.can('accounts.view') ? <AccountsTabs active="/accounts/approvals" /> : null}

      {!data.workflowOn ? (
        <Notice tone="info" title="Approval workflow is off">
          New expenses, vendor bills, stock purchases, payroll, fixed assets and expense journals go straight to the books.
          Switch the workflow on from Expense approvals to route them through Maker, Checker, Accountant and Owner.
          {pendingCount ? ' Entries already waiting can still be finished here.' : ''}
        </Notice>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {data.stages.map((s) => (
          <Metric key={s.status} label={`With ${s.label}`} value={String(s.count)} hint={`${money(s.totalMinor)}${s.mine ? ' · you sign this stage' : ''}`} />
        ))}
        <Metric label="Returned to maker" value={String(data.returned.count)} hint={money(data.returned.totalMinor)} />
        <Metric label="Total awaiting approval" value={money(pendingTotal)} hint={`${pendingCount} entries not yet in P&L / balance sheet`} />
      </div>

      <LinkTabs
        label="Views"
        items={VIEWS.map((v) => ({ href: `/accounts/approvals?view=${v.key}`, label: v.label, active: data.view === v.key }))}
      />

      {data.rows.length === 0 ? (
        <Card>
          <EmptyState
            title={data.view === 'mine' ? 'Nothing awaiting you' : data.view === 'returned' ? 'Nothing returned' : 'Nothing awaiting approval'}
            description="Entries reach a stage once the earlier stages have signed."
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {data.rows.map((e) => {
            const stageAt = chain.findIndex((s) => s.status === e.approvalStatus)
            const isFinal = stageAt === chain.length - 1
            const cycleSteps = e.approvalSteps.filter((s) => s.cycle === e.approvalCycle)
            return (
              <Card key={e.id} className="overflow-hidden">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line p-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/accounts/journals/${e.id}`} className="font-semibold text-[var(--brand-600)] hover:underline">{e.number}</Link>
                      <Badge tone={e.approvalStatus === 'RETURNED' ? 'info' : 'warning'}>{JOURNAL_STATUS_LABEL[e.approvalStatus]}</Badge>
                      <span className="text-xs text-ink-subtle">{SOURCE_LABEL[e.sourceType] ?? e.sourceType}</span>
                      {stageAt >= 0 ? <span className="text-xs text-ink-subtle">Stage {stageAt + 2} of {chain.length + 1}</span> : null}
                    </div>
                    <p className="mt-1 text-sm text-ink">{e.narration || '—'}</p>
                    <p className="text-xs text-ink-subtle">
                      {formatDay(e.date)} · Maker: {e.createdByLabel ?? 'System'}
                      {e.approvalCycle > 1 ? ` · resubmission ${e.approvalCycle - 1}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className="text-lg font-semibold tnum text-ink">{money(e.totalMinor)}</span>
                    <div className="flex flex-wrap gap-2">
                      {e.actions.map((a) => (
                        <JournalActionButton
                          key={a}
                          entryId={e.id}
                          action={a}
                          expectedStatus={e.approvalStatus}
                          finalStage={isFinal}
                          variant={a === 'return' ? 'secondary' : 'primary'}
                          label={a === 'approve' ? (isFinal ? 'Owner approve' : stageAt === 0 ? 'Check and pass' : 'Approve') : a === 'return' ? 'Return to maker' : 'Resubmit'}
                        />
                      ))}
                    </div>
                  </div>
                </div>
                <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-ink-muted">
                        <th className="pb-1 text-left font-medium">Account</th>
                        <th className="pb-1 text-right font-medium">Debit</th>
                        <th className="pb-1 text-right font-medium">Credit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {e.lines.map((l) => (
                        <tr key={l.id} className="border-t border-line">
                          <td className="py-1 text-ink">{l.account.code} · {l.account.name}{l.memo ? <span className="block text-xs text-ink-subtle">{l.memo}</span> : null}</td>
                          <td className="py-1 text-right tnum">{l.debitMinor ? money(l.debitMinor) : ''}</td>
                          <td className="py-1 text-right tnum">{l.creditMinor ? money(l.creditMinor) : ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <ol className="space-y-1 text-xs">
                    <li className="text-ink-muted">
                      <span className="font-medium text-ink">Maker</span> · {e.createdByLabel ?? 'System'}
                    </li>
                    {cycleSteps.map((s) => (
                      <li key={s.id} className="text-ink-muted">
                        <span className="font-medium text-ink">{STEP_LABEL[s.action] ?? s.action}</span> · {s.actorLabel ?? '—'} ·{' '}
                        {s.createdAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}
                        {s.remarks ? <span className="block whitespace-pre-line text-ink-subtle">“{s.remarks}”</span> : null}
                      </li>
                    ))}
                  </ol>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Who signs what</CardTitle></CardHeader>
          <CardContent>
            <ol className="space-y-1 text-sm">
              <li><span className="text-ink-muted">Stage 1 ·</span> Maker: whoever records the expense, bill, purchase, payroll or journal</li>
              {chain.map((s, i) => (
                <li key={s.status}>
                  <span className="text-ink-muted">Stage {i + 2} ·</span> {s.label}
                  {s.status === 'PENDING_OWNER' ? ' (School Admin)' : ''}
                  {ctx.can(s.permission) ? <Badge tone="success" className="ml-2">You</Badge> : null}
                </li>
              ))}
            </ol>
            <p className="mt-3 text-xs text-ink-subtle">
              The maker cannot sign their own entry and each stage needs a different person. Give the Checker, Department head and
              Accountant permissions from Roles &amp; permissions (Expense approvals).
            </p>
          </CardContent>
        </Card>
        {ctx.can('accounts.manage') ? (
          <Card>
            <CardHeader><CardTitle>Department head stage</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-ink-muted">
                {data.departmentStage
                  ? 'On: after the Checker, entries go to a Department head before the Accountant.'
                  : 'Off: entries go from the Checker straight to the Accountant.'}
                {' '}This applies to expense requests too.
              </p>
              <DepartmentStageToggle enabled={data.departmentStage} />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  )
}
