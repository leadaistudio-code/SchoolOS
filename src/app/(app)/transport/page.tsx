import Link from 'next/link'
import { AlertTriangle, MapPinned, Plus, Route as RouteIcon, UserCheck } from 'lucide-react'
import { requireContext } from '@/server/context'
import { transportOverview } from '@/server/modules/transport/service'
import { formatDay } from '@/lib/dates'
import { PageHeader } from '@/components/page-header'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Metric, MetricRow } from '@/components/ui/metric'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { buttonVariants } from '@/components/ui/button-variants'
import { BusAvatar } from '@/components/transport/bus-glyph'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'

export const metadata = { title: 'Transport' }

export default async function TransportPage() {
  const ctx = await requireContext('transport.view')
  const data = await transportOverview(ctx)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Transport"
        description={`${data.activeBuses} buses · ${data.activeRoutes} routes · ${data.riders} students travelling`}
        actions={
          <div className="flex items-center gap-2">
            {ctx.can('transport.track') ? (
              <Link href="/transport/tracking" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                <MapPinned aria-hidden />
                Live map
              </Link>
            ) : null}
            {ctx.can('transport.manage') ? (
              <Link href="/transport/buses/new" className={buttonVariants({ size: 'sm' })}>
                <Plus aria-hidden />
                Add bus
              </Link>
            ) : null}
          </div>
        }
      />

      <MetricRow>
        <Metric
          label="Buses on the road"
          value={String(data.running)}
          sub={`${data.activeBuses} in the fleet · ${data.completed} trips done today`}
          href="/transport/tracking"
        />
        <Metric
          label="Students travelling"
          value={String(data.riders)}
          sub={`${data.seats} seats across the fleet`}
          href="/transport/assignments"
        />
        <Metric
          label="Seat occupancy"
          value={`${data.occupancyPercent}%`}
          sub={data.occupancyPercent > 95 ? 'Effectively full' : 'Room to add riders'}
          emphasis={data.occupancyPercent > 95 ? 'warning' : undefined}
        />
        <Metric
          label="Needs attention"
          value={String(data.alerts.length + data.withoutDriver)}
          sub={`${data.alerts.length} document${data.alerts.length === 1 ? '' : 's'} · ${data.withoutDriver} without a driver`}
          emphasis={data.alerts.length + data.withoutDriver > 0 ? 'danger' : undefined}
        />
      </MetricRow>

      {data.alerts.length > 0 ? (
        <Card className="overflow-hidden">
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

      <Card className="overflow-hidden">
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
