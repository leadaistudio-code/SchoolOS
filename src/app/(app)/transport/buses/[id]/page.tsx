import Link from 'next/link'
import { notFound } from 'next/navigation'
import { MapPinned, Pencil, Phone, Wrench } from 'lucide-react'
import { requireContext } from '@/server/context'
import { busDetail } from '@/server/modules/transport/service'
import { formatDay } from '@/lib/dates'
import { formatMoney } from '@/lib/utils'
import { PageHeader } from '@/components/page-header'
import { Card, CardHeader, CardTitle, DescriptionItem, DescriptionList } from '@/components/ui/card'
import { Badge, StatusBadge } from '@/components/ui/badge'
import { EmptyState, Notice } from '@/components/ui/states'
import { buttonVariants } from '@/components/ui/button-variants'
import { Avatar } from '@/components/ui/identity'
import { BusGlyph } from '@/components/transport/bus-glyph'
import { RetireBusButton } from './retire-button'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'

export const metadata = { title: 'Bus' }

export default async function BusPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext('transport.view')
  const { id } = await params

  const detail = await busDetail(ctx, id).catch(() => null)
  if (!detail) notFound()

  const { bus, lastLocation, riders, alerts } = detail
  const route = bus.routes[0] ?? null
  const currency = ctx.tenant.currency

  return (
    <div className="space-y-4">
      <PageHeader
        title={bus.code}
        description={`${bus.registrationNo}${bus.model ? ` · ${bus.model}` : ''} · ${riders} of ${bus.capacity} seats used`}
        breadcrumbs={[
          { label: 'Transport', href: '/transport' },
          { label: 'Buses', href: '/transport/buses' },
          { label: bus.code },
        ]}
        actions={
          <div className="flex items-center gap-2">
            {ctx.can('transport.track') ? (
              <Link
                href="/transport/tracking"
                className={buttonVariants({ variant: 'secondary', size: 'sm' })}
              >
                <MapPinned aria-hidden />
                Track
              </Link>
            ) : null}
            {ctx.can('transport.manage') ? (
              <>
                <RetireBusButton busId={bus.id} code={bus.code} />
                <Link href={`/transport/buses/${bus.id}/edit`} className={buttonVariants({ size: 'sm' })}>
                  <Pencil aria-hidden />
                  Edit
                </Link>
              </>
            ) : null}
          </div>
        }
      />

      {alerts.length > 0 ? (
        <Notice tone={alerts.some((a) => a.expired) ? 'danger' : 'warning'} title="Papers need attention">
          {alerts
            .map((a) => `${a.label} ${a.expired ? 'expired' : 'expires'} ${formatDay(a.date)}`)
            .join(' · ')}
        </Notice>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-3">
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Route</CardTitle>
              {route ? (
                <Link
                  href={`/transport/routes/${route.id}`}
                  className="text-sm text-[var(--brand-600)] hover:underline"
                >
                  Edit stops
                </Link>
              ) : null}
            </CardHeader>

            {!route ? (
              <EmptyState
                title="No route on this bus"
                description="Assign a route so the bus appears on the live map and children can be allocated to its stops."
                action={
                  ctx.can('transport.manage') ? (
                    <Link href="/transport/routes" className={buttonVariants({ size: 'sm' })}>
                      Choose a route
                    </Link>
                  ) : undefined
                }
              />
            ) : (
              <>
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-2.5">
                  <p className="text-sm font-medium text-ink">
                    {route.name} <span className="text-ink-subtle">· {route.code}</span>
                  </p>
                  <p className="text-xs text-ink-subtle">
                    {route.stops.length} stops
                    {route.distanceKm ? ` · ${route.distanceKm} km` : ''} ·{' '}
                    {route._count.assignments} riders
                  </p>
                </div>
                <TableWrap>
                  <Table>
                    <THead>
                      <tr>
                        <TH>#</TH>
                        <TH>Stop</TH>
                        <TH>Pickup</TH>
                        <TH>Drop</TH>
                        <TH align="right">Fare</TH>
                        <TH>Coordinates</TH>
                      </tr>
                    </THead>
                    <TBody>
                      {route.stops.map((stop) => (
                        <TR key={stop.id}>
                          <TD className="tnum text-ink-subtle">{stop.sortOrder}</TD>
                          <TD className="font-medium text-ink">{stop.name}</TD>
                          <TD className="tnum">{stop.pickupTime ?? '—'}</TD>
                          <TD className="tnum">{stop.dropTime ?? '—'}</TD>
                          <TD align="right" className="tnum">
                            {stop.fareMinor === null ? '—' : formatMoney(stop.fareMinor, currency)}
                          </TD>
                          <TD>
                            {stop.latitude === null || stop.longitude === null ? (
                              <Badge tone="warning">Not plotted</Badge>
                            ) : (
                              <span className="text-xs text-ink-subtle tnum">
                                {stop.latitude.toFixed(4)}, {stop.longitude.toFixed(4)}
                              </span>
                            )}
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </TableWrap>
              </>
            )}
          </Card>

          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Recent trips</CardTitle>
            </CardHeader>
            {bus.trips.length === 0 ? (
              <EmptyState
                title="No trips recorded"
                description="Trips appear here once a driver starts one from the tracking screen."
              />
            ) : (
              <TableWrap>
                <Table>
                  <THead>
                    <tr>
                      <TH>Date</TH>
                      <TH>Route</TH>
                      <TH>Direction</TH>
                      <TH align="right">Boardings</TH>
                      <TH>Status</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {bus.trips.map((trip) => (
                      <TR key={trip.id}>
                        <TD>{formatDay(trip.onDate)}</TD>
                        <TD>{trip.route.name}</TD>
                        <TD className="first-letter:uppercase">{trip.direction.toLowerCase()}</TD>
                        <TD align="right" className="tnum">
                          {trip._count.boardings}
                        </TD>
                        <TD>
                          <StatusBadge status={trip.status} />
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableWrap>
            )}
          </Card>
        </div>

        <div className="space-y-3">
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Driver</CardTitle>
            </CardHeader>
            <div className="p-4">
              {bus.driver ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Avatar
                      firstName={bus.driver.firstName}
                      lastName={bus.driver.lastName}
                      avatarUrl={bus.driver.photoUrl}
                    />
                    <div className="min-w-0">
                      <Link
                        href={`/staff/${bus.driver.id}`}
                        className="block truncate text-sm font-medium text-ink hover:text-[var(--brand-600)]"
                      >
                        {bus.driver.firstName} {bus.driver.lastName}
                      </Link>
                      <p className="truncate text-xs text-ink-subtle">
                        {bus.driver.designation ?? 'Driver'} · {bus.driver.employeeCode}
                      </p>
                    </div>
                  </div>
                  {bus.driver.phone ? (
                    <a
                      href={`tel:${bus.driver.phone}`}
                      className="flex items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-line-strong px-3 py-2 text-sm font-medium text-ink transition-colors hover:border-[var(--brand-500)] hover:text-[var(--brand-600)]"
                    >
                      <Phone className="size-4" aria-hidden />
                      {bus.driver.phone}
                    </a>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-ink-muted">
                  No driver assigned. Families see “No driver” against this bus until one is set.
                </p>
              )}
            </div>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BusGlyph className="size-4 text-ink-subtle" />
                Vehicle
              </CardTitle>
            </CardHeader>
            <div className="px-4 py-1">
              <DescriptionList>
                <DescriptionItem label="Registration">{bus.registrationNo}</DescriptionItem>
                <DescriptionItem label="Model">{bus.model ?? '—'}</DescriptionItem>
                <DescriptionItem label="Capacity">{bus.capacity} seats</DescriptionItem>
                <DescriptionItem label="Attendant">{bus.attendantName ?? '—'}</DescriptionItem>
                <DescriptionItem label="Insurance">
                  {bus.insuranceExpiresOn ? formatDay(bus.insuranceExpiresOn) : '—'}
                </DescriptionItem>
                <DescriptionItem label="Fitness">
                  {bus.fitnessExpiresOn ? formatDay(bus.fitnessExpiresOn) : '—'}
                </DescriptionItem>
                <DescriptionItem label="Pollution">
                  {bus.pollutionExpiresOn ? formatDay(bus.pollutionExpiresOn) : '—'}
                </DescriptionItem>
                <DescriptionItem label="Last seen">
                  {lastLocation ? (
                    <span className="tnum text-xs">
                      {lastLocation.latitude.toFixed(4)}, {lastLocation.longitude.toFixed(4)}
                      <span className="block text-ink-subtle">
                        {formatDay(lastLocation.recordedAt, 'd MMM, HH:mm')}
                      </span>
                    </span>
                  ) : (
                    'Never reported'
                  )}
                </DescriptionItem>
              </DescriptionList>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wrench className="size-4 text-ink-subtle" aria-hidden />
                Maintenance
              </CardTitle>
            </CardHeader>
            {bus.maintenance.length === 0 ? (
              <p className="px-4 py-4 text-sm text-ink-muted">Nothing recorded yet.</p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {bus.maintenance.map((entry) => (
                  <li key={entry.id} className="flex items-baseline justify-between gap-3 px-4 py-2.5">
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-ink">{entry.kind}</span>
                      <span className="block text-xs text-ink-subtle">
                        {formatDay(entry.onDate)}
                        {entry.vendor ? ` · ${entry.vendor}` : ''}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm tnum text-ink-muted">
                      {entry.costMinor === null ? '—' : formatMoney(entry.costMinor, currency)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
