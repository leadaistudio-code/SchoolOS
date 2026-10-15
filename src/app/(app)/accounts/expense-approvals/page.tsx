import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState, Notice } from '@/components/ui/states'
import { LinkTabs } from '@/components/ui/tabs'
import { Pagination } from '@/components/pagination'
import { Table, TableWrap, THead, TH, TBody, TR, TD } from '@/components/ui/table'
import { ApprovalWorkflowToggle } from '@/components/accounting/expense-approval-forms'
import { NewExpenseButton } from '@/app/(app)/finance/expenses/expense-forms'
import { formatDay } from '@/lib/dates'
import { accountingEnvSwitches, getAccountingFlags } from '@/server/modules/accounting/service'
import { expenseHeadOptions } from '@/server/modules/finance/expense-heads'
import { canSeeApprovals, expenseApprovalBoard, listExpenseRequests } from '@/server/modules/accounting/expense-approval-service'
import { APPROVAL_STAGES, PROVISIONAL_STATUSES, STATUS_LABEL, stageNumber } from '@/server/modules/accounting/expense-approval'
import { APPROVAL_TONE, AccountsTabs, Metric, moneyFmt } from '../ui'

export const metadata = { title: 'Expense approvals' }

const VIEWS = [
  { key: 'awaiting', label: 'Awaiting me' },
  { key: 'mine', label: 'Prepared by me' },
  { key: 'in_progress', label: 'Open' },
  { key: 'closed', label: 'Closed' },
  { key: 'all', label: 'All' },
  { key: 'board', label: 'Board' },
] as const

export default async function ExpenseApprovalsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireContext()
  if (!canSeeApprovals(ctx)) redirect('/403')
  const flags = await getAccountingFlags(ctx.db)
  const showTabs = ctx.can('accounts.view')
  if (!flags.module) {
    return (
      <div className="space-y-4">
        <PageHeader title="Expense approvals" />
        {showTabs ? <AccountsTabs active="/accounts/expense-approvals" /> : null}
        <Notice tone="info" title="Not enabled">Accounting is switched off for this school, so expenses are recorded directly on the Expenses page.</Notice>
      </div>
    )
  }
  const params = await searchParams
  const signsAStage = APPROVAL_STAGES.some((s) => ctx.can(s.permission))
  const showBoard = params.view === 'board'
  const [list, board] = await Promise.all([
    listExpenseRequests(ctx, { ...params, view: showBoard ? 'all' : (params.view ?? (signsAStage ? 'awaiting' : 'mine')) }),
    showBoard ? expenseApprovalBoard(ctx) : Promise.resolve(null),
  ])
  const { money } = moneyFmt(ctx.tenant.currency || 'INR')
  const canCreate = list.mode !== 'off' && ctx.can('expenses.manage') && ctx.can('expenses.view')
  const heads = canCreate ? await expenseHeadOptions(ctx) : []
  const pending = { count: 0, amountMinor: 0 }
  for (const s of PROVISIONAL_STATUSES) {
    pending.count += list.byStatus[s]?.count ?? 0
    pending.amountMinor += list.byStatus[s]?.amountMinor ?? 0
  }
  const viewHref = (view: string) => `/accounts/expense-approvals?${new URLSearchParams({ view, ...(list.filter.q ? { q: list.filter.q } : {}) })}`

  return (
    <div className="space-y-4">
      <PageHeader
        title="Expense approvals"
        description="Validation, two approval levels and final approval before an expense reaches the books"
        actions={canCreate ? <NewExpenseButton heads={heads} approvals /> : null}
      />
      {showTabs ? <AccountsTabs active="/accounts/expense-approvals" /> : null}

      {list.mode === 'optional' ? (
        <Notice tone="info" title="Approval is optional">
          Expenses are recorded and posted directly unless the preparer ticks &ldquo;Send for approval&rdquo;. Those, and any created here, go through the Validator and Approvers before reaching the books.
        </Notice>
      ) : !flags.approvals ? (
        <Notice tone="info" title="Approval workflow is off">
          Expenses are recorded and posted directly. {pending.count ? 'Expenses already in approval can still be finished here.' : ''}
        </Notice>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Awaiting your sign-off" value={String(list.awaitingMe)} />
        <Metric label="Expenses under approval" value={money(pending.amountMinor)} hint={`${pending.count} not yet in the books`} />
        <Metric label="Returned for correction" value={String(list.byStatus.RETURNED?.count ?? 0)} />
        <Metric label="Approved and posted" value={String(list.byStatus.POSTED?.count ?? 0)} tone="success" hint={money(list.byStatus.POSTED?.amountMinor ?? 0)} />
      </div>

      <LinkTabs label="Views" items={VIEWS.map((v) => ({ href: viewHref(v.key), label: v.label, active: showBoard ? v.key === 'board' : list.filter.view === v.key }))} />

      {board ? (
        <div className="space-y-2">
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            {board.columns.map((c) => (
              <div key={c.key} className="flex min-h-40 flex-col rounded-xl border border-line bg-surface-2">
                <div className="border-b border-line px-3 py-2">
                  <p className="text-sm font-semibold text-ink">{c.role}</p>
                  <p className="text-xs text-ink-subtle">{c.items.length} · {money(c.totalMinor)}</p>
                </div>
                <ul className="flex-1 space-y-2 p-2">
                  {c.items.map((r) => (
                    <li key={r.id}>
                      <Link
                        href={`/accounts/expense-approvals/${r.id}`}
                        className={`block rounded-lg border bg-surface p-2 text-sm hover:border-[var(--brand-600)] ${r.actionable ? 'border-[var(--brand-600)]' : 'border-line'}`}
                      >
                        <span className="block font-medium text-ink">{r.title}</span>
                        <span className="block text-xs text-ink-subtle">{r.number} · {formatDay(r.expenseDate)}</span>
                        <span className="mt-1 flex items-center justify-between gap-2">
                          <span className="tnum font-medium">{money(r.amountMinor)}</span>
                          {r.status === 'RETURNED' ? <Badge tone="info">Returned</Badge> : r.actionable ? <Badge tone="warning">Your turn</Badge> : null}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {board.truncated ? <p className="text-xs text-ink-subtle">Showing the 100 oldest open expenses. Use the list views to see the rest.</p> : null}
        </div>
      ) : null}

      {board ? null : (
      <>
      <Card className="no-print p-4">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="view" value={list.filter.view} />
          <label className="block text-sm">
            <span className="text-ink-muted">Search</span>
            <Input name="q" defaultValue={list.filter.q ?? ''} placeholder="Number, description, payee" className="mt-1 w-64" />
          </label>
          <Button type="submit" variant="secondary">Apply</Button>
        </form>
      </Card>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {list.rows.length === 0 ? (
            <EmptyState
              title={list.filter.view === 'awaiting' ? 'Nothing awaiting you' : 'No expenses here'}
              description={list.filter.view === 'awaiting' ? 'Expenses reach you once the earlier stages have signed.' : 'Nothing matches this view.'}
            />
          ) : (
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <TH>Expense</TH>
                    <TH>Head</TH>
                    <TH>Date</TH>
                    <TH>Prepared by</TH>
                    <TH>Stage</TH>
                    <TH align="right">Amount</TH>
                  </tr>
                </THead>
                <TBody>
                  {list.rows.map((r) => {
                    const stage = stageNumber(r.status)
                    return (
                      <TR key={r.id}>
                        <TD>
                          <Link href={`/accounts/expense-approvals/${r.id}`} className="font-medium text-[var(--brand-600)] hover:underline">{r.title}</Link>
                          <span className="block text-xs text-ink-subtle">{r.number}{r.vendor ? ` · ${r.vendor}` : ''}</span>
                        </TD>
                        <TD className="text-sm">{r.headName}</TD>
                        <TD>{formatDay(r.expenseDate)}</TD>
                        <TD className="text-sm">{r.createdByLabel ?? '—'}</TD>
                        <TD>
                          <Badge tone={APPROVAL_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                          {stage ? <span className="block text-xs text-ink-subtle">Stage {stage} of 5</span> : null}
                        </TD>
                        <TD align="right" className="text-ink font-medium">{money(r.amountMinor)}</TD>
                      </TR>
                    )
                  })}
                </TBody>
              </Table>
            </TableWrap>
          )}
          <Pagination total={list.total} page={list.page} pageSize={list.pageSize} label="expenses" />
        </CardContent>
      </Card>
      </>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Who signs what</CardTitle></CardHeader>
          <CardContent>
            <ol className="space-y-1 text-sm">
              <li><span className="text-ink-muted">Stage 1 ·</span> Creator: anyone who manages expenses prepares and submits it</li>
              {APPROVAL_STAGES.map((s) => (
                <li key={s.stage}>
                  <span className="text-ink-muted">Stage {s.stage} ·</span> {s.label}
                  {ctx.can(s.permission) ? <Badge tone="success" className="ml-2">You</Badge> : null}
                </li>
              ))}
            </ol>
            <p className="mt-3 text-xs text-ink-subtle">
              The person who prepared an expense cannot sign any stage of it, and each stage needs a different person. Only final approval posts to the books.
            </p>
          </CardContent>
        </Card>

        {ctx.can('accounts.manage') ? (
          <Card>
            <CardHeader><CardTitle>Workflow switch</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-ink-muted">
                {flags.approvals
                  ? 'On: new expenses from the Expenses page and the Day Book go through approval. It can be switched off once nothing is awaiting approval.'
                  : 'Off: expenses are recorded and posted straight away, as before.'}
              </p>
              <ApprovalWorkflowToggle enabled={flags.approvals} available={accountingEnvSwitches().approvals} />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  )
}
