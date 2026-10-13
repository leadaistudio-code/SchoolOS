import Link from 'next/link'
import { requireContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableWrap, THead, TH, TBody, TR, TD } from '@/components/ui/table'
import { ACCOUNT_TYPES, accountBalances } from '@/server/modules/accounts/service'
import { naturalBalance } from '@/server/modules/accounts/math'
import { schoolToday } from '@/lib/periods'
import { AccountsTabs, moneyFmt } from '../ui'
import { AccountDialog } from './account-dialog'

export const metadata = { title: 'Chart of accounts' }

export default async function ChartOfAccountsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireContext('accounts.view')
  const params = await searchParams
  const typeFilter = ACCOUNT_TYPES.some((t) => t.type === params.type) ? params.type : undefined
  const rows = await accountBalances(ctx, { to: schoolToday() })
  const used = new Set(
    (await ctx.db.journalLine.groupBy({ by: ['accountId'], _count: { _all: true } })).map((r) => r.accountId),
  )
  const { money } = moneyFmt(ctx.tenant.currency || 'INR')
  const canManage = ctx.can('accounts.manage')
  const q = (params.q ?? '').trim().toLowerCase()
  const visible = rows.filter(
    (r) => (!typeFilter || r.type === typeFilter) && (!q || r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q)),
  )

  return (
    <div className="space-y-4">
      <PageHeader
        title="Chart of accounts"
        description="Every ledger your school posts to, with today's balance."
        actions={
          canManage ? <AccountDialog trigger={<Button size="sm">New account</Button>} /> : null
        }
      />
      <AccountsTabs active="/accounts/chart" />

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/accounts/chart"
          className={`rounded-full border px-3 py-1 text-sm ${!typeFilter ? 'border-[var(--brand-600)] text-[var(--brand-600)]' : 'border-[var(--border)] text-ink-muted'}`}
        >
          All ({rows.length})
        </Link>
        {ACCOUNT_TYPES.map((t) => (
          <Link
            key={t.type}
            href={`/accounts/chart?type=${t.type}`}
            className={`rounded-full border px-3 py-1 text-sm ${typeFilter === t.type ? 'border-[var(--brand-600)] text-[var(--brand-600)]' : 'border-[var(--border)] text-ink-muted'}`}
          >
            {t.label} ({rows.filter((r) => r.type === t.type).length})
          </Link>
        ))}
        <form method="get" className="ml-auto">
          {typeFilter ? <input type="hidden" name="type" value={typeFilter} /> : null}
          <input
            name="q"
            defaultValue={params.q ?? ''}
            placeholder="Search code or name"
            className="h-9 w-56 rounded-[var(--radius-sm)] border border-line bg-surface px-3 text-sm"
          />
        </form>
      </div>

      {ACCOUNT_TYPES.filter((t) => visible.some((r) => r.type === t.type)).map((t) => {
        const group = visible.filter((r) => r.type === t.type)
        const total = group.reduce((s, r) => s + naturalBalance(t.type, r.closingMinor), 0)
        return (
          <Card key={t.type} className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <h2 className="text-base font-semibold">{t.label}</h2>
              <span className="text-sm font-semibold tnum">{money(total)} {t.normal}</span>
            </div>
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <TH>Code</TH>
                    <TH>Account</TH>
                    <TH>Kind</TH>
                    <TH align="right">Balance</TH>
                    <TH align="right"><span className="sr-only">Actions</span></TH>
                  </tr>
                </THead>
                <TBody>
                  {group.map((r) => {
                    const bal = naturalBalance(r.type, r.closingMinor)
                    return (
                      <TR key={r.id}>
                        <TD className="tnum">{r.code}</TD>
                        <TD>
                          <Link href={`/accounts/ledger?account=${r.id}`} className="font-medium text-ink hover:text-[var(--brand-600)]">
                            {r.name}
                          </Link>
                          {r.description ? <span className="block text-xs text-ink-subtle">{r.description}</span> : null}
                        </TD>
                        <TD>
                          {r.type === 'EXPENSE' ? (
                            <Badge tone={r.expenseNature === 'DIRECT' ? 'brand' : 'warning'}>
                              {r.expenseNature === 'DIRECT' ? 'Direct' : 'Indirect'}
                            </Badge>
                          ) : null}{' '}
                          {r.systemKey ? <Badge tone="neutral">System</Badge> : null}{' '}
                          {!r.isActive ? <Badge tone="warning">Inactive</Badge> : null}
                        </TD>
                        <TD align="right" className={bal < 0 ? 'text-[var(--danger)]' : undefined}>
                          {bal === 0 ? '—' : `${bal < 0 ? '−' : ''}${money(bal)}`}
                        </TD>
                        <TD align="right">
                          <span className="inline-flex gap-3 text-sm">
                            <Link href={`/accounts/ledger?account=${r.id}`} className="text-[var(--brand-600)] hover:underline">
                              Ledger
                            </Link>
                            {canManage ? (
                              <AccountDialog
                                values={{
                                  id: r.id,
                                  code: r.code,
                                  name: r.name,
                                  type: r.type,
                                  description: r.description,
                                  openingBalance: naturalBalance(r.type, r.openingBalanceMinor) / 100,
                                  isActive: r.isActive,
                                  isSystem: !!r.systemKey,
                                  hasEntries: used.has(r.id),
                                  expenseNature: r.expenseNature,
                                }}
                                trigger={<button type="button" className="text-[var(--brand-600)] hover:underline">Edit</button>}
                              />
                            ) : null}
                          </span>
                        </TD>
                      </TR>
                    )
                  })}
                </TBody>
              </Table>
            </TableWrap>
          </Card>
        )
      })}
    </div>
  )
}
