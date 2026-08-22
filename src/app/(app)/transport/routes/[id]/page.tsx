import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Phone, Users } from 'lucide-react'
import { requireContext } from '@/server/context'
import { busOptions, routeDetail } from '@/server/modules/transport/service'
import { PageHeader } from '@/components/page-header'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { BusAvatar } from '@/components/transport/bus-glyph'
import { RouteForm } from '../route-form'
import { StopEditor } from './stop-editor'
import { mapsClientKey } from '@/server/maps'

export const metadata = { title: 'Route' }

export default async function RoutePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext('transport.view')
  const { id } = await params

  const detail = await routeDetail(ctx, id).catch(() => null)
  if (!detail) notFound()

  const { route, school } = detail
  const canManage = ctx.can('transport.manage')
  const buses = canManage ? await busOptions(ctx) : []
  const riders = route.stops.reduce((sum, stop) => sum + stop._count.assignments, 0)

  return (
    <div className="space-y-4">
      <PageHeader
        title={route.name}
        description={`${route.code} · ${route.stops.length} stops · ${riders} students${
          route.distanceKm ? ` · ${route.distanceKm} km` : ''
        }`}
        breadcrumbs={[
          { label: 'Transport', href: '/transport' },
          { label: 'Routes & Stops', href: '/transport/routes' },
          { label: route.code },
        ]}
        actions={<Badge tone={route.isActive ? 'success' : 'neutral'}>{route.isActive ? 'Running' : 'Suspended'}</Badge>}
      />

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          {canManage ? (
            <RouteForm
              buses={buses}
              route={{
                id: route.id,
                name: route.name,
                code: route.code,
                busId: route.busId,
                distanceKm: route.distanceKm,
                isActive: route.isActive,
              }}
            />
          ) : null}
        </div>

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Bus &amp; driver</CardTitle>
          </CardHeader>
          <div className="space-y-3 p-4">
            {route.bus ? (
              <>
                <div className="flex items-center gap-3">
                  <BusAvatar />
                  <div className="min-w-0">
                    <Link
                      href={`/transport/buses/${route.bus.id}`}
                      className="block truncate text-sm font-medium text-ink hover:text-[var(--brand-600)]"
                    >
                      {route.bus.code}
                    </Link>
                    <p className="truncate text-xs text-ink-subtle">
                      {route.bus.registrationNo} · {route.bus.capacity} seats
                    </p>
                  </div>
                </div>

                {route.bus.driver ? (
                  <div className="rounded-[var(--radius-sm)] border border-line px-3 py-2">
                    <p className="text-sm text-ink">
                      {route.bus.driver.firstName} {route.bus.driver.lastName}
                    </p>
                    <p className="text-xs text-ink-subtle">{route.bus.driver.employeeCode}</p>
                    {route.bus.driver.phone ? (
                      <a
                        href={`tel:${route.bus.driver.phone}`}
                        className="mt-1.5 flex items-center gap-1.5 text-sm text-[var(--brand-600)] hover:underline"
                      >
                        <Phone className="size-3.5" aria-hidden />
                        {route.bus.driver.phone}
                      </a>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-sm text-ink-muted">No driver on this bus yet.</p>
                )}
              </>
            ) : (
              <p className="text-sm text-ink-muted">
                No bus is allocated to this route, so it will not appear on the live map.
              </p>
            )}

            <p className="flex items-center gap-1.5 text-sm text-ink-muted">
              <Users className="size-4 text-ink-subtle" aria-hidden />
              {riders} student{riders === 1 ? '' : 's'} on this route
              {route.bus ? ` of ${route.bus.capacity} seats` : ''}
            </p>
          </div>
        </Card>
      </div>

      <StopEditor
        routeId={route.id}
        canManage={canManage}
        school={school}
        mapsKey={mapsClientKey()}
        initial={route.stops.map((stop) => ({
          id: stop.id,
          name: stop.name,
          pickupTime: stop.pickupTime ?? '',
          dropTime: stop.dropTime ?? '',
          latitude: stop.latitude === null ? '' : String(stop.latitude),
          longitude: stop.longitude === null ? '' : String(stop.longitude),
          fare: stop.fareMinor === null ? '' : String(stop.fareMinor / 100),
          riders: stop._count.assignments,
        }))}
      />
    </div>
  )
}
