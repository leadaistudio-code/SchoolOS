import Link from 'next/link'
import { requireContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState, Notice } from '@/components/ui/states'
import { Table, TableWrap, THead, TH, TBody, TR, TD } from '@/components/ui/table'
import { DocumentAction } from '@/components/accounting/payables-forms'
import { FrequencySelect, RunDepreciationButton } from '@/components/accounting/fixed-asset-forms'
import { formatDay } from '@/lib/dates'
import { ApiException } from '@/server/api/response'
import { getAccountingFlags } from '@/server/modules/accounting/service'
import { getDepreciationRun, listDepreciationRuns, previewDepreciation } from '@/server/modules/accounting/fixed-assets-service'
import { formatRate } from '@/server/modules/accounting/fixed-assets'
import { AccountsTabs, Metric, moneyFmt } from '../../ui'

export const metadata = { title: 'Depreciation runs' }

function day(iso: string) {
  return formatDay(new Date(`${iso}T00:00:00Z`))
}

const RUN_TONE = { POSTED: 'success', SUBMITTED: 'warning', REJECTED: 'neutral', REVERSED: 'neutral' } as const
const RUN_LABEL = { POSTED: 'Posted', SUBMITTED: 'Awaiting approval', REJECTED: 'Rejected', REVERSED: 'Reversed' } as const

export default async function DepreciationPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireContext('accounts.view')
  const flags = await getAccountingFlags(ctx.db)
  if (!flags.module) {
    return (
      <div className="space-y-4">
        <PageHeader title="Depreciation runs" />
        <AccountsTabs active="/accounts/fixed-assets" />
        <Notice tone="info" title="Not enabled">Fixed asset accounting is switched off for this school.</Notice>
      </div>
    )
  }
  const params = await searchParams
  const [preview, runs, selected] = await Promise.all([
    previewDepreciation(ctx, params.periodEnd),
    listDepreciationRuns(ctx),
    params.run
      ? getDepreciationRun(ctx, params.run).catch((e: unknown) => {
          if (e instanceof ApiException && e.status === 404) return null
          throw e
        })
      : Promise.resolve(null),
  ])
  const { money } = moneyFmt(ctx.tenant.currency || 'INR')
  const canManage = ctx.can('accounts.manage')
  const latestPosted = runs.find((r) => r.status === 'POSTED')
  const pending = runs.find((r) => r.status === 'SUBMITTED')
  const runUrl = (id: string) => `/api/v1/accounting/fixed-assets/depreciation/${id}`

  return (
    <div className="space-y-4">
      <PageHeader
        title="Depreciation runs"
        description="Written-down value, charged on each financial year's opening value by days held"
        actions={canManage ? <FrequencySelect value={preview.frequency} /> : <Badge tone="neutral">{preview.frequency === 'MONTHLY' ? 'Monthly runs' : 'Yearly runs'}</Badge>}
      />
      <AccountsTabs active="/accounts/fixed-assets" />
      <p className="text-sm"><Link href="/accounts/fixed-assets" className="text-[var(--brand-600)] hover:underline">← Fixed assets</Link></p>

      {pending ? (
        <Notice tone="warning" title={`Run ${pending.number} is awaiting approval`}>
          {money(pending.totalMinor)} to {formatDay(pending.periodEnd)}, submitted by {pending.createdByLabel ?? 'unknown'}.{' '}
          <Link href={`/accounts/fixed-assets/depreciation?run=${pending.id}`} className="underline">Review it</Link>
          {canManage && pending.createdById === ctx.user.userId ? ' Another manager must approve it.' : null}
        </Notice>
      ) : null}

      {selected ? (
        <Card className="overflow-hidden">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>
                Run {selected.run.number} · {formatDay(selected.run.periodStart)} – {formatDay(selected.run.periodEnd)}{' '}
                <Badge tone={RUN_TONE[selected.run.status]}>{RUN_LABEL[selected.run.status]}</Badge>
              </CardTitle>
              {canManage ? (
                <div className="flex flex-wrap gap-2">
                  {selected.run.status === 'SUBMITTED' && selected.run.createdById !== ctx.user.userId ? (
                    <DocumentAction url={runUrl(selected.run.id)} action="approve" label="Approve and post" variant="primary" />
                  ) : null}
                  {selected.run.status === 'SUBMITTED' ? (
                    <DocumentAction url={runUrl(selected.run.id)} action="reject" label="Reject" needsReason variant="danger" />
                  ) : null}
                  {selected.run.status === 'POSTED' && latestPosted?.id === selected.run.id ? (
                    <DocumentAction url={runUrl(selected.run.id)} action="reverse" label="Reverse run" needsReason variant="danger" />
                  ) : null}
                </div>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-4 pb-3 text-sm text-ink-muted space-y-1">
              <p>
                Created by {selected.run.createdByLabel ?? 'unknown'} on {formatDay(selected.run.createdAt)}
                {selected.run.approvedByLabel ? ` · approved by ${selected.run.approvedByLabel}` : ''}
                {selected.run.rejectionReason ? ` · rejected: ${selected.run.rejectionReason}` : ''}
                {selected.run.reversalReason ? ` · reversed: ${selected.run.reversalReason}` : ''}
              </p>
              {selected.entries.length ? (
                <p>
                  Journals:{' '}
                  {selected.entries.map((e, i) => (
                    <span key={e.id}>
                      {i ? ', ' : ''}
                      <Link href={`/accounts/journals/${e.id}`} className="text-[var(--brand-600)] hover:underline">{e.number}</Link>
                      {e.isReversal ? ' (reversal)' : ''}
                    </span>
                  ))}
                </p>
              ) : null}
            </div>
            <RunLines
              money={money}
              lines={selected.run.lines.map((l) => ({
                key: l.id,
                assetId: l.assetId,
                code: l.asset.code,
                name: l.asset.name,
                fromDate: l.fromDate.toISOString().slice(0, 10),
                toDate: l.toDate.toISOString().slice(0, 10),
                fiscalYearLabel: l.fiscalYearLabel,
                chargeableDays: l.chargeableDays,
                rateBp: l.rateBp,
                openingWdvMinor: l.openingWdvMinor,
                amountMinor: l.amountMinor,
                closingWdvMinor: l.closingWdvMinor,
                lifeEnd: l.lifeEnd,
              }))}
              totalMinor={selected.run.totalMinor}
            />
          </CardContent>
        </Card>
      ) : params.run ? (
        <Notice tone="danger">That depreciation run was not found.</Notice>
      ) : null}

      <Card className="overflow-hidden">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Preview · {day(preview.period.start)} – {day(preview.periodEnd)}</CardTitle>
            <form method="get" className="no-print flex items-center gap-2">
              <Input type="date" name="periodEnd" defaultValue={preview.periodEnd} className="w-40" aria-label="Period end" />
              <Button type="submit" size="sm" variant="secondary">Preview</Button>
            </form>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="px-4 pb-3 space-y-3">
            <p className="text-sm text-ink-muted">
              Choose the last day of a {preview.frequency === 'MONTHLY' ? 'month' : 'financial year'}. Assets catch up from the day after their last posted period; nothing already posted is charged again.
            </p>
            {preview.problems.map((p) => <Notice key={p} tone="warning">{p}</Notice>)}
            <div className="grid gap-4 sm:grid-cols-3">
              <Metric label="Depreciation" value={money(preview.totalMinor)} hint="Dr Depreciation · Cr Accumulated Depreciation" />
              <Metric label="Assets" value={String(new Set(preview.lines.map((l) => l.assetId)).size)} />
              <Metric label="Posting" value={preview.approvals ? 'Needs approval' : 'Posts at once'} hint={preview.approvals ? 'a different manager approves' : 'approvals are off'} />
            </div>
            {canManage && preview.problems.length === 0 && preview.lines.length ? (
              <RunDepreciationButton
                key={preview.periodEnd}
                periodEnd={preview.periodEnd}
                label={preview.approvals ? `Submit ${money(preview.totalMinor)} for approval` : `Post ${money(preview.totalMinor)}`}
              />
            ) : null}
          </div>
          {preview.lines.length ? (
            <RunLines
              money={money}
              lines={preview.lines.map((l) => ({ ...l, key: `${l.assetId}-${l.fromDate}` }))}
              totalMinor={preview.totalMinor}
            />
          ) : null}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader><CardTitle>Runs</CardTitle></CardHeader>
        <CardContent className="p-0">
          {runs.length === 0 ? <EmptyState title="No depreciation runs yet" /> : (
            <TableWrap>
              <Table>
                <THead><tr><TH>Run</TH><TH>Period</TH><TH align="right">Assets</TH><TH align="right">Depreciation</TH><TH>Status</TH><TH>By</TH></tr></THead>
                <TBody>
                  {runs.map((r) => (
                    <TR key={r.id}>
                      <TD><Link href={`/accounts/fixed-assets/depreciation?run=${r.id}`} className="font-medium text-[var(--brand-600)] hover:underline">{r.number}</Link></TD>
                      <TD className="text-sm">{formatDay(r.periodStart)} – {formatDay(r.periodEnd)}<span className="block text-xs text-ink-subtle">{r.frequency === 'MONTHLY' ? 'Monthly' : 'Yearly'}</span></TD>
                      <TD align="right">{r._count.lines}</TD>
                      <TD align="right">{money(r.totalMinor)}</TD>
                      <TD><Badge tone={RUN_TONE[r.status]}>{RUN_LABEL[r.status]}</Badge></TD>
                      <TD className="text-sm">{r.createdByLabel ?? '—'}{r.approvedByLabel ? <span className="block text-xs text-ink-subtle">approved by {r.approvedByLabel}</span> : null}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

type RunLine = {
  key: string
  assetId: string
  code: string
  name: string
  fromDate: string
  toDate: string
  fiscalYearLabel: string
  chargeableDays: number
  rateBp: number
  openingWdvMinor: number
  amountMinor: number
  closingWdvMinor: number
  lifeEnd: boolean
}

function RunLines({ lines, totalMinor, money }: { lines: RunLine[]; totalMinor: number; money: (minor: number) => string }) {
  return (
    <TableWrap>
      <Table>
        <THead>
          <tr>
            <TH>Asset</TH>
            <TH>Period</TH>
            <TH align="right">Days</TH>
            <TH align="right">Rate</TH>
            <TH align="right">Opening WDV</TH>
            <TH align="right">Depreciation</TH>
            <TH align="right">Closing WDV</TH>
          </tr>
        </THead>
        <TBody>
          {lines.map((l) => (
            <TR key={l.key}>
              <TD>
                <Link href={`/accounts/fixed-assets/${l.assetId}`} className="text-[var(--brand-600)] hover:underline">{l.name}</Link>
                <span className="block text-xs text-ink-subtle">{l.code}</span>
              </TD>
              <TD className="text-sm">
                {day(l.fromDate)} – {day(l.toDate)}
                <span className="block text-xs text-ink-subtle">FY {l.fiscalYearLabel}{l.lifeEnd ? ' · end of useful life' : ''}</span>
              </TD>
              <TD align="right">{l.chargeableDays}</TD>
              <TD align="right">{formatRate(l.rateBp)}</TD>
              <TD align="right">{money(l.openingWdvMinor)}</TD>
              <TD align="right" className="text-ink">{money(l.amountMinor)}</TD>
              <TD align="right">{money(l.closingWdvMinor)}</TD>
            </TR>
          ))}
          <TR className="bg-[var(--surface-2)]">
            <TD className="font-medium" colSpan={5}>Total</TD>
            <TD align="right" className="font-medium">{money(totalMinor)}</TD>
            <TD />
          </TR>
        </TBody>
      </Table>
    </TableWrap>
  )
}
