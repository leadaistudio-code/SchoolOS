import { requireContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox, Select } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'
import { getPostingSetup } from '@/server/modules/accounts/service'
import { saveLedgerSettingsAction, setMappingAction, syncBooksAction } from '../actions'
import { AccountsTabs } from '../ui'

export const metadata = { title: 'Posting rules' }

type Setup = Awaited<ReturnType<typeof getPostingSetup>>
type MapRow = Setup['feeHeads'][number]

export default async function PostingRulesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireContext('accounts.view')
  const params = await searchParams
  const setup = await getPostingSetup(ctx)
  const canManage = ctx.can('accounts.manage')

  const MapTable = ({ title, description, rows, types }: { title: string; description: string; rows: MapRow[]; types: string[] }) => (
    <Card className="overflow-hidden">
      <div className="border-b border-[var(--border)] px-4 py-3">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-sm text-ink-muted">{description}</p>
      </div>
      <ul className="divide-y divide-[var(--border)]">
        {rows.map((r) => (
          <li key={`${r.kind}:${r.key}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2">
            <span className="text-sm font-medium capitalize">{r.label}</span>
            {canManage ? (
              <form action={setMappingAction} className="flex items-center gap-2">
                <input type="hidden" name="kind" value={r.kind} />
                <input type="hidden" name="localKey" value={r.key} />
                <Select name="accountId" defaultValue={r.accountId} className="w-72" aria-label={`Account for ${r.label}`}>
                  <option value="">
                    Default{r.defaultAccount ? `: ${r.defaultAccount.name}` : ''}
                  </option>
                  {setup.accounts
                    .filter((a) => a.isActive && types.includes(a.type))
                    .map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
                </Select>
                <Button type="submit" size="sm" variant="secondary">Save</Button>
              </form>
            ) : (
              <span className="text-sm text-ink-muted">
                {setup.accounts.find((a) => a.id === r.accountId)?.name ?? r.defaultAccount?.name ?? '—'}
              </span>
            )}
          </li>
        ))}
      </ul>
    </Card>
  )

  return (
    <div className="space-y-4">
      <PageHeader title="Posting rules" description="Which account each fee head, payment mode and expense category posts to." />
      <AccountsTabs active="/accounts/settings" />

      {params.synced ? (
        <Notice tone={params.failed && params.failed !== '0' ? 'warning' : 'success'} title="Books updated">
          {params.posted ?? 0} entries posted, {params.reposted ?? 0} corrected, {params.reversed ?? 0} reversed
          {params.failed && params.failed !== '0' ? `, ${params.failed} could not be posted (see server logs)` : ''}.
        </Notice>
      ) : null}

      <Card className="p-4">
        <h2 className="text-base font-semibold">Automatic posting</h2>
        {setup.tallyEnabled ? (
          <p className="mt-1 text-sm text-ink-muted">
            Tally is connected and remains your official books. Keep automatic posting on to mirror receipts here for quick
            reports, or switch it off if your accountant only wants Tally.
          </p>
        ) : null}
        <form action={saveLedgerSettingsAction} className="mt-3 space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox name="autoPostFees" defaultChecked={setup.settings.autoPostFees} disabled={!canManage} />
            Post fee receipts, refunds, cancellations and cleared cheques automatically
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox name="autoPostExpenses" defaultChecked={setup.settings.autoPostExpenses} disabled={!canManage} />
            Post expenses from the expense tracker and paid salaries from payroll automatically
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox name="autoPostStore" defaultChecked={setup.settings.autoPostStore} disabled={!canManage} />
            Post school store sales, stock purchases and stock adjustments automatically
          </label>
          {canManage ? <Button type="submit" size="sm">Save</Button> : null}
        </form>
      </Card>

      {canManage ? (
        <Card className="p-4">
          <h2 className="text-base font-semibold">Sync books</h2>
          <p className="mt-1 text-sm text-ink-muted">
            {setup.settings.lastSyncedAt
              ? `Last synced ${setup.settings.lastSyncedAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}. `
              : 'Not synced yet. '}
            New receipts post instantly and a daily job catches anything missed. After changing a rule below, use Rebuild to
            re-post old entries to the new accounts (each change is a reversal plus a new entry; nothing is deleted).
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <form action={syncBooksAction}>
              <Button type="submit" size="sm" variant="secondary">Sync recent changes</Button>
            </form>
            <form action={syncBooksAction}>
              <input type="hidden" name="full" value="1" />
              <Button type="submit" size="sm" variant="secondary">Rebuild from all records</Button>
            </form>
          </div>
        </Card>
      ) : null}

      <MapTable
        title="Fee heads → income account"
        description="Default guesses from the fee head name (tuition, transport, admission, exam). Refundable deposits go to Security Deposits."
        rows={setup.feeHeads}
        types={['INCOME', 'LIABILITY']}
      />
      <MapTable
        title="Payment modes → cash / bank account"
        description="Cash goes to Cash in Hand; everything else to Bank Account. Map UPI or cards to a separate bank if you use one."
        rows={setup.modes}
        types={['ASSET']}
      />
      <MapTable
        title="Expense categories → expense account"
        description="Used for entries from the expense tracker."
        rows={setup.expenseCategories}
        types={['EXPENSE', 'ASSET']}
      />
    </div>
  )
}
