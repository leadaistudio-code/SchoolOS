import Link from 'next/link'
import { requireContext } from '@/server/context'
import { SettingsPageHeader, SettingsPanelHeader } from '@/components/settings/settings-page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Notice } from '@/components/ui/states'
import { getTallyStatus } from '@/server/modules/tally/settings'
import { listTallyConnectors, listTallyPairingCodes } from '@/server/modules/tally/pairing'
import {
  createPairingAction,
  revokeConnectorAction,
  saveTallySettingsAction,
  enqueueSyncAction,
} from '@/app/(app)/finance/tally/actions'

export const metadata = { title: 'Tally ERP' }

export default async function TallySettingsPage() {
  const ctx = await requireContext('settings.integrations')
  const [status, connectors, pairingCodes] = await Promise.all([
    getTallyStatus(ctx),
    listTallyConnectors(ctx),
    listTallyPairingCodes(ctx),
  ])
  const i = status.integration

  return (
    <div className="space-y-4">
      <SettingsPageHeader
        title="Tally ERP"
        description="Connect this school’s Tally.ERP 9 company through a local connector. Port 9000 stays on the school PC — never exposed to the internet."
        icon="Plug"
        tone="info"
        actions={
          <Link href="/finance/tally" className="text-sm font-medium text-[var(--brand-600)] hover:underline">
            Open Sync Center
          </Link>
        }
      />

      {i.testMode ? (
        <Notice tone="warning" title="Test mode is on">
          Connection and master sync work, but live receipt vouchers are not posted to Tally until you turn test mode off.
        </Notice>
      ) : null}

      <Card className="overflow-hidden">
        <SettingsPanelHeader
          title="Connection"
          description={`Health: ${i.health}${i.lastConnectionAt ? ` · Last check ${i.lastConnectionAt.toLocaleString('en-IN')}` : ''}`}
          icon="Plug"
          tone={i.health === 'HEALTHY' ? 'success' : 'warning'}
        />
        <form action={saveTallySettingsAction} className="grid gap-4 p-4 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="enabled" defaultChecked={i.enabled} />
            Enable Tally integration
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="testMode" defaultChecked={i.testMode} />
            Test mode (no live vouchers)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="autoSyncReceipts" defaultChecked={i.autoSyncReceipts} />
            Auto-queue fee receipts
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="autoCreateLedgers" defaultChecked={i.autoCreateLedgers} />
            Allow automatic ledger creation
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="text-ink-muted">Tally company name</span>
            <input
              name="companyName"
              defaultValue={i.companyName ?? ''}
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-white px-3 py-2"
              placeholder="ABC International School"
            />
          </label>
          <label className="block text-sm">
            <span className="text-ink-muted">Connection mode</span>
            <select
              name="mode"
              defaultValue={i.mode}
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-white px-3 py-2"
            >
              <option value="CONNECTOR">Local connector (recommended)</option>
              <option value="DIRECT">Direct HTTP (self-hosted only)</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-ink-muted">Party / debtor model</span>
            <select
              name="partyModel"
              defaultValue={i.partyModel}
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-white px-3 py-2"
            >
              <option value="STUDENT_LEDGER">One ledger per student</option>
              <option value="CLASS_LEDGER">Class / fee-category ledgers</option>
              <option value="FEE_CATEGORY_LEDGER">Fee-head income only</option>
              <option value="CUSTOM">Custom rules</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-ink-muted">Direct host (only if mode = Direct)</span>
            <input
              name="host"
              defaultValue={i.host ?? ''}
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-white px-3 py-2"
              placeholder="192.168.1.50"
            />
          </label>
          <label className="block text-sm">
            <span className="text-ink-muted">Port</span>
            <input
              name="port"
              type="number"
              defaultValue={i.port}
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-white px-3 py-2"
            />
          </label>
          {i.lastConnectionError ? (
            <p className="sm:col-span-2 text-sm text-danger">{i.lastConnectionError}</p>
          ) : null}
          <div className="sm:col-span-2">
            <button
              type="submit"
              className="rounded-md bg-[var(--brand-600)] px-4 py-2 text-sm font-medium text-white"
            >
              Save settings
            </button>
          </div>
        </form>
      </Card>

      <Card className="overflow-hidden">
        <SettingsPanelHeader
          title="Local Tally Connector"
          description="Install the connector on the Windows PC that runs Tally. Pair with a one-time code."
          icon="KeyRound"
          tone="success"
        />
        <div className="space-y-4 p-4">
          <form action={createPairingAction} className="flex flex-wrap items-end gap-3">
            <label className="block text-sm">
              <span className="text-ink-muted">Connector name</span>
              <input
                name="connectorName"
                defaultValue="Office Tally Connector"
                className="mt-1 block rounded-md border border-[var(--border)] bg-white px-3 py-2"
              />
            </label>
            <button
              type="submit"
              className="rounded-md border border-[var(--border)] px-4 py-2 text-sm font-medium"
            >
              Generate pairing code
            </button>
          </form>

          <ul className="divide-y divide-[var(--border)] rounded-md border border-[var(--border)]">
            {pairingCodes.length === 0 ? (
              <li className="px-3 py-2 text-sm text-ink-muted">No pairing codes yet.</li>
            ) : (
              pairingCodes.map((code) => (
                <li key={code.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span className="font-mono tnum">{code.codeDisplay}</span>
                  <span className="text-ink-muted">
                    {code.usedAt
                      ? 'Used'
                      : `Expires ${code.expiresAt.toLocaleString('en-IN')}`}
                  </span>
                </li>
              ))
            )}
          </ul>

          <ul className="divide-y divide-[var(--border)] rounded-md border border-[var(--border)]">
            {connectors.length === 0 ? (
              <li className="px-3 py-2 text-sm text-ink-muted">No connectors paired.</li>
            ) : (
              connectors.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span>
                    <span className="font-medium">{c.name}</span>
                    <Badge tone={c.status === 'ONLINE' ? 'success' : 'neutral'} className="ml-2" dot>
                      {c.status.toLowerCase()}
                    </Badge>
                    <span className="mt-0.5 block text-xs text-ink-muted">
                      {c.tallyHost}:{c.tallyPort}
                      {c.lastSeenAt ? ` · seen ${c.lastSeenAt.toLocaleString('en-IN')}` : ''}
                    </span>
                  </span>
                  <form action={revokeConnectorAction}>
                    <input type="hidden" name="connectorId" value={c.id} />
                    <button type="submit" className="text-sm text-danger hover:underline">
                      Revoke
                    </button>
                  </form>
                </li>
              ))
            )}
          </ul>

          <form action={enqueueSyncAction} className="flex flex-wrap gap-2">
            <input type="hidden" name="type" value="TEST_CONNECTION" />
            <button type="submit" className="rounded-md border border-[var(--border)] px-3 py-2 text-sm">
              Queue test connection
            </button>
          </form>
          <p className="text-xs text-ink-muted">
            Install <strong>MyCampusView Tally Connector</strong> on the Tally PC
            (<code className="font-mono">MyCampusView-Tally-Connector-Setup-1.0.0.exe</code>
            from <code className="font-mono">tools/tally-connector</code>). Pair with the code
            above, test Tally, then enable the Windows startup service. Details:
            <code className="font-mono">docs/tally-integration.md</code>.
          </p>
        </div>
      </Card>
    </div>
  )
}
