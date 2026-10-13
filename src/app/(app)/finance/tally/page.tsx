import Link from 'next/link'
import { requireContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Notice } from '@/components/ui/states'
import { Select } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { formatMoney } from '@/lib/utils'
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  GitCompareArrows,
  ListChecks,
  PlugZap,
  RefreshCw,
  RotateCcw,
  Wand2,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { ACCENT, ActionButton, StatCard } from '@/components/ui/stat-card'
import { getTallyStatus } from '@/server/modules/tally/settings'
import {
  suggestFeeHeadMappings,
  listAccountingRules,
  listCachedLedgers,
} from '@/server/modules/tally/mappings'
import { listVoucherLinks } from '@/server/modules/tally/receipts'
import { listReconciliation } from '@/server/modules/tally/reconciliation'
import {
  autoMapAction,
  enqueueSyncAction,
  mapFeeHeadAction,
  retryFailedAction,
  runReconAction,
  seedPaymentRulesAction,
  setRuleLedgerAction,
} from './actions'

type LedgerOption = { name: string; group: string }

// Tally prefixes reserved groups with control characters (e.g. "\u0004 Primary").
function groupLabel(parent: string | null): string {
  const cleaned = (parent ?? '').replace(/[\u0000-\u001f]/g, '').trim()
  return cleaned || 'Other'
}

function LedgerOptions({ ledgers }: { ledgers: LedgerOption[] }) {
  const groups = new Map<string, string[]>()
  for (const l of ledgers) groups.set(l.group, [...(groups.get(l.group) ?? []), l.name])
  return (
    <>
      {[...groups.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([group, names]) => (
          <optgroup key={group} label={group}>
            {names.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </optgroup>
        ))}
    </>
  )
}

export const metadata = { title: 'Tally Sync Center' }

export default async function FinanceTallyPage() {
  const ctx = await requireContext('fees.tally')
  const canManage = ctx.can('fees.tally_manage')
  const [status, suggestions, rules, pendingLinks, recon, cached] = await Promise.all([
    getTallyStatus(ctx),
    suggestFeeHeadMappings(ctx),
    listAccountingRules(ctx),
    listVoucherLinks(ctx, { take: 20 }),
    listReconciliation(ctx),
    listCachedLedgers(ctx),
  ])
  const i = status.integration
  const unmapped = suggestions.filter((s) => !s.mappedLedger)
  const ledgers: LedgerOption[] = cached
    .map((l) => ({ name: l.name, group: groupLabel(l.parent) }))
    .filter((l) => l.group !== 'Primary')
  const known = new Set(cached.map((l) => l.name))
  const noLedgers = ledgers.length === 0
  const online = i.health === 'HEALTHY'
  const degraded = i.health === 'DEGRADED'

  return (
    <div className="space-y-4">
      <PageHeader
        title="Tally Sync Center"
        description="Map fee heads, queue sync jobs, and reconcile collections against Tally."
        actions={
          <div className="flex items-center gap-3">
            <Link
              href="/finance/tally/trial-balance"
              className="text-sm font-medium text-[var(--brand-600)] hover:underline"
            >
              Trial balance
            </Link>
            {ctx.can('settings.integrations') ? (
              <Link
                href="/settings/tally"
                className="text-sm font-medium text-[var(--brand-600)] hover:underline"
              >
                Connection settings
              </Link>
            ) : null}
          </div>
        }
      />

      {!i.enabled ? (
        <Notice tone="warning" title="Tally integration is disabled">
          Enable it under Settings → Tally ERP after pairing the local connector.
        </Notice>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Connection"
          value={i.health}
          icon={online || degraded ? Wifi : WifiOff}
          accent={online ? ACCENT.emerald : degraded ? ACCENT.amber : ACCENT.rose}
          tone={online ? 'success' : degraded ? 'warning' : 'danger'}
          hint={
            online
              ? 'Connector is talking to Tally'
              : degraded
                ? 'Connector is up but Tally is not answering'
                : 'Start the connector on the Tally PC'
          }
        />
        <StatCard
          label="Pending"
          value={String(status.metrics.pending)}
          icon={Clock}
          accent={ACCENT.amber}
          hint="Waiting to be sent to Tally"
        />
        <StatCard
          label="Failed / review"
          value={String(status.metrics.failed)}
          icon={AlertTriangle}
          accent={ACCENT.rose}
          tone={status.metrics.failed > 0 ? 'danger' : undefined}
          hint={status.metrics.failed > 0 ? 'Needs attention' : 'Nothing to review'}
        />
        <StatCard
          label="Synced today"
          value={String(status.metrics.syncedToday)}
          icon={CheckCircle2}
          accent={ACCENT.indigo}
          hint="Vouchers posted in Tally"
        />
      </div>

      {canManage ? (
        <Card className="flex flex-wrap gap-2 p-3">
          <form action={enqueueSyncAction}>
            <input type="hidden" name="type" value="TEST_CONNECTION" />
            <ActionButton icon={PlugZap} accent={ACCENT.sky}>Test connection</ActionButton>
          </form>
          <form action={enqueueSyncAction}>
            <input type="hidden" name="type" value="FETCH_MASTERS" />
            <ActionButton icon={RefreshCw} accent={ACCENT.indigo}>Sync masters</ActionButton>
          </form>
          <form action={autoMapAction}>
            <ActionButton icon={Wand2} accent={ACCENT.violet}>Auto-map fee heads (≥92%)</ActionButton>
          </form>
          <form action={seedPaymentRulesAction}>
            <ActionButton icon={ListChecks} accent={ACCENT.teal}>Seed payment-mode rules</ActionButton>
          </form>
          <form action={runReconAction}>
            <ActionButton icon={GitCompareArrows} accent={ACCENT.amber}>Reconcile</ActionButton>
          </form>
          <form action={retryFailedAction}>
            <ActionButton icon={RotateCcw} accent={ACCENT.rose}>Retry failed</ActionButton>
          </form>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-base font-semibold">Fee head → Tally ledger</h2>
          <p className="text-sm text-ink-muted">
            {unmapped.length} unmapped · {status.metrics.unmappedFeeHeads} still need a ledger
          </p>
        </div>
        {noLedgers ? (
          <p className="border-b border-[var(--border)] px-4 py-3 text-sm text-ink-muted">
            No Tally ledgers loaded yet. Click Sync masters with the company open in Tally.
          </p>
        ) : null}
        <ul className="divide-y divide-[var(--border)]">
          {suggestions.map((row) => {
            const missing = !!row.mappedLedger && !known.has(row.mappedLedger)
            return (
              <li key={row.feeHeadId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <span>
                  <span className="font-medium">{row.name}</span>
                  <span className="ml-2 text-xs text-ink-muted">{row.code}</span>
                  {missing ? (
                    <Badge tone="danger" className="ml-2" dot>
                      {row.mappedLedger} not in Tally
                    </Badge>
                  ) : row.mappedLedger ? (
                    <Badge tone="success" className="ml-2" dot>
                      {row.mappedLedger}
                    </Badge>
                  ) : row.suggestion ? (
                    <Badge tone="warning" className="ml-2" dot>
                      Suggest {row.suggestion.ledgerName} ({row.suggestion.score}%)
                    </Badge>
                  ) : (
                    <Badge tone="neutral" className="ml-2" dot>
                      Unmapped
                    </Badge>
                  )}
                </span>
                {canManage && !noLedgers ? (
                  <form
                    key={`${row.feeHeadId}:${row.mappedLedger ?? ''}`}
                    action={mapFeeHeadAction}
                    className="flex items-center gap-2"
                  >
                    <input type="hidden" name="feeHeadId" value={row.feeHeadId} />
                    <Select
                      name="tallyLedgerName"
                      aria-label={`Tally ledger for ${row.name}`}
                      defaultValue={row.mappedLedger ?? row.suggestion?.ledgerName ?? ''}
                      className="w-56"
                    >
                      <option value="">— Not mapped —</option>
                      <LedgerOptions ledgers={ledgers} />
                    </Select>
                    <Button type="submit" size="sm" variant="secondary">
                      Save
                    </Button>
                  </form>
                ) : null}
              </li>
            )
          })}
        </ul>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-base font-semibold">Payment mode rules</h2>
          <p className="text-sm text-ink-muted">
            The Tally ledger debited for each payment mode (usually Cash-in-Hand or a Bank Account).
          </p>
        </div>
        <ul className="divide-y divide-[var(--border)]">
          {rules.length === 0 ? (
            <li className="px-4 py-3 text-sm text-ink-muted">No rules yet — seed defaults above.</li>
          ) : (
            rules.map((rule) => {
              const missing = !known.has(rule.debitLedgerName)
              return (
                <li key={rule.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span>
                    <span className="font-medium">{rule.name}</span>
                    <span className="ml-2 text-ink-muted">{rule.paymentMode ?? 'default'}</span>
                    <Badge tone={missing ? 'danger' : 'success'} className="ml-2" dot>
                      Dr {rule.debitLedgerName}
                      {missing ? ' — not in Tally' : ''}
                    </Badge>
                  </span>
                  {canManage && !noLedgers ? (
                    <form
                      key={`${rule.id}:${rule.debitLedgerName}`}
                      action={setRuleLedgerAction}
                      className="flex items-center gap-2"
                    >
                      <input type="hidden" name="ruleId" value={rule.id} />
                      <Select
                        name="debitLedgerName"
                        aria-label={`Debit ledger for ${rule.name}`}
                        defaultValue={missing ? '' : rule.debitLedgerName}
                        required
                        className="w-56"
                      >
                        <option value="" disabled>
                          Choose a ledger…
                        </option>
                        <LedgerOptions ledgers={ledgers} />
                      </Select>
                      <Button type="submit" size="sm" variant="secondary">
                        Save
                      </Button>
                    </form>
                  ) : null}
                </li>
              )
            })
          )}
        </ul>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-base font-semibold">Recent voucher links</h2>
        </div>
        <ul className="divide-y divide-[var(--border)]">
          {pendingLinks.length === 0 ? (
            <li className="px-4 py-3 text-sm text-ink-muted">No sync records yet.</li>
          ) : (
            pendingLinks.map((link) => {
              const preview = (link.previewJson ?? {}) as { receiptNumber?: string; date?: string }
              const label = preview.receiptNumber ?? `${link.entityKind} · ${link.entityId.slice(0, 8)}…`
              return (
              <li key={link.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span>
                  {link.entityKind === 'FEE_PAYMENT' ? (
                    <Link
                      href={`/finance/payments/${link.entityId}`}
                      className="font-medium text-[var(--brand-600)] hover:underline"
                    >
                      {label}
                    </Link>
                  ) : (
                    <span className="font-medium">{label}</span>
                  )}
                  <span className="ml-2 text-ink-muted">
                    {[
                      link.voucherType,
                      preview.date,
                      link.amountMinor != null ? formatMoney(link.amountMinor, ctx.tenant.currency || 'INR') : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                <Badge
                  tone={
                    link.status === 'SYNCED'
                      ? 'success'
                      : link.status === 'FAILED' || link.status === 'REQUIRES_REVIEW'
                        ? 'danger'
                        : 'warning'
                  }
                  dot
                >
                  {link.status}
                </Badge>
              </li>
              )
            })
          )}
        </ul>
      </Card>

      {recon.summary ? (
        <Card className="p-4">
          <h2 className="text-base font-semibold">Last reconciliation</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Run {recon.runId?.slice(0, 8)}… · matched {recon.summary.matched} · unmatched{' '}
            {recon.summary.unmatchedMcv} · amount mismatch {recon.summary.amountMismatch} · failed{' '}
            {recon.summary.failedSync}
          </p>
        </Card>
      ) : null}
    </div>
  )
}
