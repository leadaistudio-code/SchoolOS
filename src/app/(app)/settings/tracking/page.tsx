import { headers } from 'next/headers'
import { requireContext } from '@/server/context'
import { listIngestTokens, listTrackedBuses } from '@/server/modules/transport/ingest'
import { PageHeader } from '@/components/page-header'
import { TrackingSetup } from './tracking-setup'

export const metadata = { title: 'GPS trackers' }

/**
 * Wiring hardware trackers into the app.
 *
 * Behind `transport.manage` rather than a settings permission: the person who
 * knows which device is bolted into which bus is the transport manager, not
 * whoever administers the portal.
 */
export default async function TrackingSetupPage() {
  const ctx = await requireContext('transport.manage')

  const [tokens, buses, headerList] = await Promise.all([
    listIngestTokens(ctx),
    listTrackedBuses(ctx),
    headers(),
  ])

  // The school's own address, so the setup instructions can be copied straight
  // into Traccar rather than having the host typed in by hand.
  const host = headerList.get('host') ?? 'your-school.mycampusview.com'
  const proto = headerList.get('x-forwarded-proto') ?? 'https'

  return (
    <div>
      <PageHeader
        title="GPS trackers"
        description="Connect hardware trackers so buses report their position without a driver keeping a phone awake"
        breadcrumbs={[{ label: 'Settings', href: '/settings' }, { label: 'GPS trackers' }]}
      />

      <TrackingSetup
        tokens={tokens.map((t) => ({
          ...t,
          lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
          revokedAt: t.revokedAt?.toISOString() ?? null,
          createdAt: t.createdAt.toISOString(),
        }))}
        buses={buses.map((b) => ({
          id: b.id,
          code: b.code,
          registrationNo: b.registrationNo,
          gpsDeviceId: b.gpsDeviceId,
          isActive: b.isActive,
          lastFixAt: b.locations[0]?.recordedAt.toISOString() ?? null,
        }))}
        endpoint={`${proto}://${host}/api/v1/transport/ingest`}
      />
    </div>
  )
}
