import Link from 'next/link'
import {
  AlertTriangle,
  Bus,
  Gauge,
  MapPinned,
  Plus,
  Route as RouteIcon,
  UserCheck,
} from 'lucide-react'
import { requireContext } from '@/server/context'
import { transportOverview } from '@/server/modules/transport/service'
import { formatDay } from '@/lib/dates'
import { formatNumber } from '@/lib/utils'
import {
  ColorBanner,
  ColorTile,
  colorBannerPrimaryBtn,
  colorBannerSecondaryBtn,
} from '@/components/dashboard/color-tiles'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { buttonVariants } from '@/components/ui/button-variants'
import { BusAvatar } from '@/components/transport/bus-glyph'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'

export const metadata = { title: 'Transport' }

export default async function TransportPage() {
  const ctx = await requireContext('transport.view')
  const data = await transportOverview(ctx)
  const needsAttention = data.alerts.length + data.withoutDriver

  return (
    <div className="space-y-4">
      <ColorBanner
        tone="transport"
        eyebrow="Transport"
        title={
          data.activeBuses > 0
            ? `${formatNumber(data.activeBuses)} buses · ${formatNumber(data.riders)} riders`
            : 'Transport fleet'
        }
        description={`${formatNumber(data.activeRoutes)} routes · ${formatNumber(data.seats)} seats across the fleet`}
        actions={
          <>
            {ctx.can('transport.track') ? (
              <Link href="/transport/tracking" className={colorBannerSecondaryBtn()}>
                <MapPinned aria-hidden />
                Live map
              </Link>
            ) : null}
            {ctx.can('transport.manage') ? (
              <Link href="/transport/buses/new" className={colorBannerPrimaryBtn()}>
                <Plus aria-hidden />
                Add bus
              </Link>
            ) : null}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ColorTile
          label="Buses on the road"
          value={formatNumber(data.running)}
          sub={`${formatNumber(data.activeBuses)} in the fleet · ${formatNumber(data.completed)} trips done today`}
          tone="transport"
          href="/transport/tracking"
          icon={<Bus className="size-5" aria-hidden />}
          delayMs={40}
        />
        <ColorTile
          label="Students travelling"
          value={formatNumber(data.riders)}
          sub={`${formatNumber(data.seats)} seats across the fleet`}
          tone="students"
          href="/transport/assignments"
          icon={<UserCheck className="size-5" aria-hidden />}
          delayMs={80}
        />
        <ColorTile
          label="Seat occupancy"
          value={`${data.occupancyPercent}%`}
          sub={data.occupancyPercent > 95 ? 'Effectively full' : 'Room to add riders'}
          tone={data.occupancyPercent > 95 ? 'overdue' : 'attendance'}
          href="/transport/assignments"
          icon={<Gauge className="size-5" aria-hidden />}
          delayMs={120}
        />
        <ColorTile
          label="Needs attention"
          value={formatNumber(needsAttention)}
          sub={`${formatNumber(data.alerts.length)} document${data.alerts.length === 1 ? '' : 's'} · ${formatNumber(data.withoutDriver)} without a driver`}
          tone={needsAttention > 0 ? 'overdue' : 'pending'}
          href="#fleet"
          icon={<AlertTriangle className="size-5" aria-hidden />}
          delayMs={160}
        />
      </div>

      {data.alerts.length > 0 ? (
        <Card variant="elevated" className="overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-warning" aria-hidden />
              Paperwork expiring
            </CardTitle>
            <span className="text-xs text-ink-subtle">Next 30 days</span>
          </CardHeader>
          <ul className="divide-y divide-[var(--border)]">
            {data.alerts.slice(0, 6).map((alert) => (
              <li
                key={`${alert.bus.id}-${alert.label}`}
                className="flex items-center gap-3 px-4 py-2.5"
              >
                <BusAvatar tone={alert.expired ? 'danger' : 'muted'} />
                <span className="min-w-0 flex-1">
                  <Link
                    href={`/transport/buses/${alert.bus.id}`}
                    className="block truncate text-sm font-medium text-ink hover:text-[var(--brand-600)]"
                  >
                    {alert.bus.code} · {alert.bus.registrationNo}
                  </Link>
                  <span className="block text-xs text-ink-subtle">
                    {alert.label} {alert.expired ? 'expired' : 'expires'} {formatDay(alert.date)}
                  </span>
                </span>
                <Badge tone={alert.expired ? 'danger' : 'warning'}>
                  {alert.expired ? 'Expired' : 'Due soon'}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card id="fleet" variant="elevated" className="scroll-mt-20 overflow-hidden">
        <CardHeader>
          <CardTitle>Fleet</CardTitle>
          <Link href="/transport/buses" className="text-sm text-[var(--brand-600)] hover:underline">
            All buses
          </Link>
        </CardHeader>

        {data.buses.length === 0 ? (
          <EmptyState
            title="No buses yet"
            description="Add the first bus, give it a route with stops, and families can start tracking it."
            action={
              ctx.can('transport.manage') ? (
                <Link href="/transport/buses/new" className={buttonVariants({ size: 'sm' })}>
                  Add a bus
                </Link>
              ) : undefined
            }
          />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Bus</TH>
                  <TH>Route</TH>
                  <TH>Driver</TH>
                  <TH align="right">Riders</TH>
                  <TH>Status</TH>
                </tr>
              </THead>
              <TBody>
                {data.buses.slice(0, 10).map((bus) => (
                  <TR key={bus.id}>
                    <TD>
                      <Link
                        href={`/transport/buses/${bus.id}`}
                        className="group flex items-center gap-2"
                      >
                        <BusAvatar tone={bus.isActive ? 'brand' : 'muted'} />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-ink group-hover:text-[var(--brand-600)]">
                            {bus.code}
                          </span>
                          <span className="block truncate text-xs text-ink-subtle">
                            {bus.registrationNo}
                          </span>
                        </span>
                      </Link>
                    </TD>
                    <TD>{bus.routes[0]?.name ?? <span className="text-ink-subtle">Unassigned</span>}</TD>
                    <TD>
                      {bus.driver ? (
                        `${bus.driver.firstName} ${bus.driver.lastName}`
                      ) : (
                        <span className="text-[var(--danger)]">No driver</span>
                      )}
                    </TD>
                    <TD align="right">
                      <span className="tnum">
                        {bus._count.assignments}
                        <span className="text-ink-subtle"> / {bus.capacity}</span>
                      </span>
                    </TD>
                    <TD>
                      <Badge tone={bus.isActive ? 'success' : 'neutral'}>
                        {bus.isActive ? 'In service' : 'Off road'}
                      </Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <QuickLink
          href="/transport/routes"
          icon={<RouteIcon className="size-4" aria-hidden />}
          title="Routes & stops"
          description={`${data.activeRoutes} routes${
            data.stopsWithoutCoordinates ? ` · ${data.stopsWithoutCoordinates} stops need coordinates` : ''
          }`}
        />
        <QuickLink
          href="/transport/tracking"
          icon={<MapPinned className="size-4" aria-hidden />}
          title="Live tracking"
          description="Follow every bus on the map"
        />
        <QuickLink
          href="/transport/assignments"
          icon={<UserCheck className="size-4" aria-hidden />}
          title="Assignments"
          description={`${data.riders} students on a route`}
        />
      </div>
    </div>
  )
}

function QuickLink({
  href,
  icon,
  title,
  description,
}: {
  href: string
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <Link
      href={href}
      className="flex items-start gap-3 rounded-[var(--radius)] border border-line bg-surface px-4 py-3 transition-colors hover:border-[var(--brand-500)]"
    >
      <span className="mt-0.5 text-ink-subtle">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{title}</span>
        <span className="block text-xs text-ink-subtle">{description}</span>
      </span>
    </Link>
  )
}
