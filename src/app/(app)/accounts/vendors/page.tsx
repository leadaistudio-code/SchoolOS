import Link from 'next/link'
import { requireContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { EmptyState, Notice } from '@/components/ui/states'
import { Pagination } from '@/components/pagination'
import { Table, TableWrap, THead, TH, TBody, TR, TD } from '@/components/ui/table'
import { VendorDialog } from '@/components/accounting/payables-forms'
import { getAccountingFlags } from '@/server/modules/accounting/service'
import { listVendors } from '@/server/modules/accounting/payables-service'
import { AccountsTabs, moneyFmt } from '../ui'

export const metadata = { title: 'Vendors' }

export default async function VendorsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireContext('accounts.view')
  const flags = await getAccountingFlags(ctx.db)
  if (!flags.module) {
    return (
      <div className="space-y-4">
        <PageHeader title="Vendors" />
        <AccountsTabs active="/accounts/vendors" />
        <Notice tone="info" title="Not enabled">Vendor accounting is switched off for this school.</Notice>
      </div>
    )
  }
  const params = await searchParams
  const list = await listVendors(ctx, { q: params.q, status: params.status, page: params.page })
  const { money } = moneyFmt(ctx.tenant.currency || 'INR')
  const canManage = ctx.can('accounts.manage')

  return (
    <div className="space-y-4">
      <PageHeader
        title="Vendors"
        description={`${list.total} ${list.total === 1 ? 'vendor' : 'vendors'} · sundry creditors`}
        actions={canManage ? <VendorDialog label="New vendor" /> : null}
      />
      <AccountsTabs active="/accounts/vendors" />

      <Card className="p-4">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="block text-sm">
            <span className="text-ink-muted">Search</span>
            <Input name="q" defaultValue={params.q ?? ''} placeholder="Name, code or GSTIN" className="mt-1 w-64" />
          </label>
          <label className="block text-sm">
            <span className="text-ink-muted">Status</span>
            <Select name="status" defaultValue={params.status ?? 'active'} className="mt-1 w-36">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="all">All</option>
            </Select>
          </label>
          <Button type="submit" variant="secondary">Apply</Button>
        </form>
      </Card>

      <Card className="overflow-hidden">
        {list.rows.length === 0 ? (
          <EmptyState title="No vendors found" description={canManage ? 'Add a vendor to start entering supplier bills.' : 'Change the search or status filter.'} />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Vendor</TH>
                  <TH>GSTIN</TH>
                  <TH>Terms</TH>
                  <TH align="right">Open bills</TH>
                  <TH align="right">Overdue</TH>
                  <TH align="right">Net liability</TH>
                </tr>
              </THead>
              <TBody>
                {list.rows.map(({ vendor, netLiabilityMinor, overdueMinor, openBills }) => (
                  <TR key={vendor.id}>
                    <TD>
                      <Link href={`/accounts/vendors/${vendor.id}`} className="font-medium text-[var(--brand-600)] hover:underline">{vendor.name}</Link>
                      <span className="block text-xs text-ink-subtle">{vendor.code}{vendor.contactPerson ? ` · ${vendor.contactPerson}` : ''}</span>
                      {!vendor.isActive ? <Badge tone="neutral">Inactive</Badge> : null}
                    </TD>
                    <TD className="text-sm">{vendor.gstin ?? '—'}</TD>
                    <TD className="text-sm">{vendor.creditDays ? `${vendor.creditDays} days` : 'Immediate'}</TD>
                    <TD align="right">{openBills}</TD>
                    <TD align="right" className={overdueMinor > 0 ? 'text-[var(--danger)]' : ''}>{overdueMinor ? money(overdueMinor) : '—'}</TD>
                    <TD align="right" className="text-ink">{money(netLiabilityMinor)}{netLiabilityMinor < 0 ? ' (advance)' : ''}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
        <Pagination total={list.total} page={list.page} pageSize={list.pageSize} label="vendors" />
      </Card>
    </div>
  )
}
