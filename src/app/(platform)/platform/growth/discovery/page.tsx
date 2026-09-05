import Link from 'next/link'
import { requirePlatformContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { ColorTile } from '@/components/dashboard/color-tiles'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { EmptyState } from '@/components/ui/states'
import { buttonVariants } from '@/components/ui/button-variants'
import { formatNumber } from '@/lib/utils'
import { opportunityLabel, SCHOOL_STATUS_LABELS, type SchoolDiscoveryStatus } from '@/lib/lead-discovery'
import {
  discoveryListFilterSchema,
  getDiscoveryDashboard,
  listDiscoveryCandidates,
  listDiscoveryRuns,
} from '@/server/modules/platform/growth/discovery/service'
import { CandidateActions, RunDiscoveryButton } from './discovery-controls'
import { DiscoverySettingsForm } from './settings-form'

export const metadata = { title: 'AI Lead Discovery' }

function priorityTone(p: string): 'danger' | 'warning' | 'info' | 'neutral' {
  if (p === 'HOT') return 'danger'
  if (p === 'HIGH') return 'warning'
  if (p === 'MEDIUM') return 'info'
  return 'neutral'
}

function verificationTone(v: string): 'success' | 'warning' | 'info' | 'danger' | 'neutral' {
  if (v === 'VERIFIED') return 'success'
  if (v === 'STRONG_LEAD') return 'info'
  if (v === 'NEEDS_VERIFICATION') return 'warning'
  if (v === 'REJECTED') return 'danger'
  return 'neutral'
}

export default async function DiscoveryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requirePlatformContext('platform.crm')
  const canEdit = ctx.user.permissions.has('platform.crm_edit')
  const canCreate = ctx.user.permissions.has('platform.crm_create')
  const sp = await searchParams
  const filter = discoveryListFilterSchema.parse({
    city: typeof sp.city === 'string' ? sp.city : undefined,
    verification: typeof sp.verification === 'string' ? sp.verification : undefined,
    priority: typeof sp.priority === 'string' ? sp.priority : undefined,
    linked: typeof sp.linked === 'string' ? sp.linked : undefined,
    q: typeof sp.q === 'string' ? sp.q : undefined,
  })

  const [dash, rows, runs] = await Promise.all([
    getDiscoveryDashboard(ctx),
    listDiscoveryCandidates(ctx, filter),
    listDiscoveryRuns(ctx),
  ])

  return (
    <div className="space-y-4">
      <PageHeader
        title="AI Lead Discovery"
        description="Discover newly opened and expanding schools for the Growth CRM — Faridabad first, more cities from settings."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/platform/growth" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              Growth CRM
            </Link>
            {canEdit ? <RunDiscoveryButton /> : null}
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <ColorTile label="New today" value={formatNumber(dash.stats.newToday)} tone="admissions" delayMs={0} />
        <ColorTile label="Strong leads" value={formatNumber(dash.stats.strong)} tone="fees" delayMs={40} />
        <ColorTile label="Verified" value={formatNumber(dash.stats.verified)} tone="attendance" delayMs={80} />
        <ColorTile label="Needs verification" value={formatNumber(dash.stats.needs)} tone="pending" delayMs={120} />
        <ColorTile label="In CRM" value={formatNumber(dash.stats.linked)} tone="students" delayMs={160} />
        <ColorTile label="Rejected / ignored" value={formatNumber(dash.stats.rejected)} tone="overdue" delayMs={200} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 overflow-hidden">
          <CardHeader>
            <CardTitle>Discoveries</CardTitle>
            <form className="flex flex-wrap gap-2 text-sm">
              <input
                name="q"
                defaultValue={filter.q ?? ''}
                placeholder="Search school / area"
                className="rounded-[var(--radius-sm)] border border-line bg-surface px-2 py-1.5"
              />
              <select
                name="verification"
                defaultValue={filter.verification ?? ''}
                className="rounded-[var(--radius-sm)] border border-line bg-surface px-2 py-1.5"
              >
                <option value="">All verification</option>
                <option value="VERIFIED">Verified</option>
                <option value="STRONG_LEAD">Strong lead</option>
                <option value="NEEDS_VERIFICATION">Needs verification</option>
                <option value="REJECTED">Rejected</option>
              </select>
              <select
                name="priority"
                defaultValue={filter.priority ?? ''}
                className="rounded-[var(--radius-sm)] border border-line bg-surface px-2 py-1.5"
              >
                <option value="">All priority</option>
                <option value="HOT">Hot</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
              <select
                name="linked"
                defaultValue={filter.linked ?? ''}
                className="rounded-[var(--radius-sm)] border border-line bg-surface px-2 py-1.5"
              >
                <option value="">CRM linked?</option>
                <option value="yes">In CRM</option>
                <option value="no">Not in CRM</option>
              </select>
              <button type="submit" className={buttonVariants({ size: 'sm', variant: 'secondary' })}>
                Filter
              </button>
            </form>
          </CardHeader>
          {rows.length === 0 ? (
            <EmptyState
              title="No discoveries yet"
              description={
                canEdit
                  ? 'Configure a search API key (LEAD_DISCOVERY_SEARCH_DRIVER) and run discovery, or wait for the daily cron.'
                  : 'No AI discoveries have been recorded yet.'
              }
            />
          ) : (
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <TH>School</TH>
                    <TH>Status</TH>
                    <TH>Verification</TH>
                    <TH>Priority</TH>
                    <TH>Opportunity</TH>
                    <TH>CRM</TH>
                    <TH align="right"> </TH>
                  </tr>
                </THead>
                <TBody>
                  {rows.map((row) => (
                    <TR key={row.id}>
                      <TD>
                        <Link
                          href={`/platform/growth/discovery/${row.id}`}
                          className="font-medium text-ink hover:underline"
                        >
                          {row.schoolName}
                        </Link>
                        <p className="text-xs text-ink-muted">
                          {[row.sector, row.area, row.city].filter(Boolean).join(' · ') || '—'}
                        </p>
                      </TD>
                      <TD className="text-sm text-ink-muted">
                        {row.schoolStatus
                          ? SCHOOL_STATUS_LABELS[row.schoolStatus as SchoolDiscoveryStatus] ??
                            row.schoolStatus
                          : '—'}
                      </TD>
                      <TD>
                        <Badge tone={verificationTone(row.verificationStatus)}>
                          {row.verificationStatus.replaceAll('_', ' ').toLowerCase()}
                        </Badge>
                      </TD>
                      <TD>
                        <Badge tone={priorityTone(row.salesPriority)}>{row.salesPriority}</Badge>
                      </TD>
                      <TD className="text-sm tnum">
                        {row.opportunityScore}
                        <span className="ml-1 text-xs text-ink-subtle">
                          {opportunityLabel(row.opportunityScore)}
                        </span>
                      </TD>
                      <TD className="text-sm">
                        {row.crmSchoolId ? (
                          <Badge tone="success">In CRM</Badge>
                        ) : (
                          <span className="text-ink-subtle">Not linked</span>
                        )}
                      </TD>
                      <TD align="right">
                        {canCreate || canEdit ? (
                          <CandidateActions
                            id={row.id}
                            crmSchoolId={row.crmSchoolId}
                            website={row.website}
                          />
                        ) : null}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Discovery runs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 py-3">
              {runs.length === 0 ? (
                <p className="text-sm text-ink-muted">No runs yet.</p>
              ) : (
                runs.slice(0, 8).map((run) => (
                  <div key={run.id} className="border-b border-line pb-2 last:border-0">
                    <p className="text-sm font-medium text-ink">
                      {run.startedAt.toLocaleString('en-IN')} · {run.status.toLowerCase()}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {run.location?.city ?? 'All cities'} · {run.resultsFound} hits ·{' '}
                      {run.createdLeads} created · {run.updatedLeads} updated
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {canEdit ? (
            <DiscoverySettingsForm
              settings={dash.settings}
              locations={dash.locations.map((l) => ({
                id: l.id,
                city: l.city,
                state: l.state,
                enabled: l.enabled,
                priority: l.priority,
              }))}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
