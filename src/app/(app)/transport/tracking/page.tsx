import { requireContext } from '@/server/context'
import { mapsClientKey } from '@/server/maps'
import { driverToday, trackingSnapshot } from '@/server/modules/transport/tracking'
import { PageHeader } from '@/components/page-header'
import { DriverConsole } from './driver-console'
import { LiveTracking } from './live-tracking'

export const metadata = { title: 'Live Tracking' }

// The map is only ever as fresh as its last ping; caching it would put a bus
// on screen where it was, not where it is.
export const dynamic = 'force-dynamic'

export default async function TrackingPage() {
  const ctx = await requireContext('transport.track')
  const snapshot = await trackingSnapshot(ctx)

  // A driver signed in on their phone gets the trip controls above the map:
  // it is the same screen, but their job on it is to report, not to watch.
  const driver = ctx.can('transport.drive') ? await driverToday(ctx) : null

  const running = snapshot.buses.filter((b) => b.trip?.status === 'RUNNING' && !b.stale).length

  return (
    <div>
      <PageHeader
        title="Live Tracking"
        description={
          snapshot.scoped
            ? 'Where your children’s bus is right now, and when it reaches their stop.'
            : `${running} of ${snapshot.buses.length} buses reporting · positions refresh every 15 seconds`
        }
      />

      {driver ? <DriverConsole initial={driver} className="mb-3" /> : null}

      <LiveTracking initial={snapshot} mapsKey={mapsClientKey()} />
    </div>
  )
}
