import Link from 'next/link'
import { format } from 'date-fns'
import { requirePlatformContext } from '@/server/context'
import { parseListQuery } from '@/lib/query'
import { listOperators, listSchools } from '@/server/modules/platform/growth/service'
import { schoolListFilterSchema } from '@/server/modules/platform/growth/schema'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { SearchBar } from '@/components/search-bar'
import { Pagination } from '@/components/pagination'
import { buttonVariants } from '@/components/ui/button-variants'
import { formatMoney } from '@/lib/utils'
import {
  CRM_STAGES,
  LEAD_SOURCES,
  LEAD_SOURCE_LABELS,
  STAGE_LABELS,
  TEMPERATURES,
  type CrmStage,
} from '@/lib/growth-crm'

export const metadata = { title: 'Schools · Growth CRM' }

export default async function GrowthSchoolsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requirePlatformContext('platform.crm')
  const params = await searchParams
  const query = parseListQuery(params)
  const filter = schoolListFilterSchema.parse(params)
  const [{ rows, total }, operators] = await Promise.all([
    listSchools(ctx, query, filter),
    listOperators(ctx),
  ])
  const canCreate = ctx.user.permissions.has('platform.crm_create')

  return (
    <div className="space-y-4">
      <PageHeader
        title="Schools"
        description={`${total} prospect${total === 1 ? '' : 's'}`}
        breadcrumbs={[{ label: 'Growth CRM', href: '/platform/growth' }, { label: 'Schools' }]}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/platform/growth/pipeline" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              Pipeline
            </Link>
            {canCreate ? (
              <Link href="/platform/growth/schools/new" className={buttonVariants({ size: 'sm' })}>
                Add school
              </Link>
            ) : null}
          </div>
        }
      />

      <Card className="overflow-hidden">
        <SearchBar placeholder="Search school, city, contact, phone, ERP" />
        <FilterBar operators={operators} params={params} />

        {rows.length === 0 ? (
          <EmptyState title="No matching schools" description="Try a different search or add a prospect." />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>School</TH>
                  <TH>Contact</TH>
                  <TH>Stage</TH>
                  <TH>Owner</TH>
                  <TH>Source</TH>
                  <TH>Next follow-up</TH>
                  <TH align="right">Deal</TH>
                </tr>
              </THead>
              <TBody>
                {rows.map((school) => {
                  const contact = school.contacts[0]
                  return (
                    <TR key={school.id}>
                      <TD>
                        <Link href={`/platform/growth/schools/${school.id}`} className="text-sm font-medium text-ink hover:underline">
                          {school.name}
                        </Link>
                        <p className="text-xs text-ink-subtle">
                          {[school.city, school.temperature.toLowerCase()].filter(Boolean).join(' · ')}
                        </p>
                      </TD>
                      <TD className="text-sm text-ink-muted">
                        {contact ? (
                          <>
                            {contact.fullName}
                            {contact.mobile ? <span className="block text-xs tnum">{contact.mobile}</span> : null}
                          </>
                        ) : (
                          <span className="text-ink-subtle">—</span>
                        )}
                      </TD>
                      <TD>
                        <Badge tone={school.stage === 'WON' ? 'success' : school.stage === 'LOST' ? 'danger' : 'neutral'}>
                          {STAGE_LABELS[school.stage as CrmStage]}
                        </Badge>
                      </TD>
                      <TD className="text-sm text-ink-muted">
                        {school.owner ? `${school.owner.firstName} ${school.owner.lastName}` : 'Unassigned'}
                      </TD>
                      <TD className="text-sm text-ink-muted">
                        {school.leadSource
                          ? LEAD_SOURCE_LABELS[school.leadSource as keyof typeof LEAD_SOURCE_LABELS] ?? school.leadSource
                          : '—'}
                      </TD>
                      <TD className="text-sm text-ink-muted">
                        {school.nextFollowUpAt ? format(school.nextFollowUpAt, 'd MMM') : (
                          <span className="text-warning">None</span>
                        )}
                      </TD>
                      <TD align="right" className="text-sm tnum">
                        {school.dealValueMinor ? formatMoney(school.dealValueMinor) : '—'}
                      </TD>
                    </TR>
                  )
                })}
              </TBody>
            </Table>
          </TableWrap>
        )}
        <Pagination total={total} page={query.page} pageSize={query.pageSize} label="schools" />
      </Card>
    </div>
  )
}

function FilterBar({
  operators,
  params,
}: {
  operators: { id: string; firstName: string; lastName: string }[]
  params: Record<string, string | undefined>
}) {
  return (
    <form method="get" className="flex flex-wrap gap-2 border-b border-line px-3 py-2">
      {params.q ? <input type="hidden" name="q" value={params.q} /> : null}
      <select name="stage" defaultValue={params.stage ?? ''} className="h-8 rounded-[var(--radius-sm)] border border-line-strong bg-surface px-2 text-xs">
        <option value="">All stages</option>
        {CRM_STAGES.map((stage) => (
          <option key={stage} value={stage}>
            {STAGE_LABELS[stage]}
          </option>
        ))}
      </select>
      <select name="ownerId" defaultValue={params.ownerId ?? ''} className="h-8 rounded-[var(--radius-sm)] border border-line-strong bg-surface px-2 text-xs">
        <option value="">All owners</option>
        {operators.map((op) => (
          <option key={op.id} value={op.id}>
            {op.firstName} {op.lastName}
          </option>
        ))}
      </select>
      <select name="leadSource" defaultValue={params.leadSource ?? ''} className="h-8 rounded-[var(--radius-sm)] border border-line-strong bg-surface px-2 text-xs">
        <option value="">All sources</option>
        {LEAD_SOURCES.map((source) => (
          <option key={source} value={source}>
            {LEAD_SOURCE_LABELS[source]}
          </option>
        ))}
      </select>
      <select name="temperature" defaultValue={params.temperature ?? ''} className="h-8 rounded-[var(--radius-sm)] border border-line-strong bg-surface px-2 text-xs">
        <option value="">Any temperature</option>
        {TEMPERATURES.map((t) => (
          <option key={t} value={t}>
            {t.toLowerCase()}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-1 text-xs text-ink-muted">
        <input type="checkbox" name="overdue" defaultChecked={params.overdue === 'on'} />
        Overdue
      </label>
      <label className="flex items-center gap-1 text-xs text-ink-muted">
        <input type="checkbox" name="noNextAction" defaultChecked={params.noNextAction === 'on'} />
        No next action
      </label>
      <label className="flex items-center gap-1 text-xs text-ink-muted">
        <input type="checkbox" name="stale" defaultChecked={params.stale === 'on'} />
        Stale
      </label>
      <button type="submit" className="text-xs font-medium text-[var(--brand-600)]">
        Apply
      </button>
    </form>
  )
}
