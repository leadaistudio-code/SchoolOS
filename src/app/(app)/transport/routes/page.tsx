import Link from 'next/link'
import { Plus } from 'lucide-react'
import { requireContext } from '@/server/context'
import { listRoutes } from '@/server/modules/transport/service'
import { parseListQuery } from '@/lib/query'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { buttonVariants } from '@/components/ui/button-variants'
import { SearchBar } from '@/components/search-bar'
import { Pagination } from '@/components/pagination'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'

export const metadata = { title: 'Routes & Stops' }

export default async function RoutesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireContext('transport.view')
  const params = await searchParams
  const query = parseListQuery(params)
  const { rows, total } = await listRoutes(ctx, query)

  const unplotted = rows.reduce(
    (count, route) => count + route.stops.filter((s) => s.latitude === null).length,
    0,
  )

  return (
    <div>
      <PageHeader
        title="Routes & Stops"
        description={
          unplotted > 0
            ? `${total} routes · ${unplotted} stops still need coordinates before they appear on the map`
            : `${total} route${total === 1 ? '' : 's'}`
        }
        breadcrumbs={[{ label: 'Transport', href: '/transport' }, { label: 'Routes & Stops' }]}
        actions={
          ctx.can('transport.manage') ? (
            <Link href="/transport/routes/new" className={buttonVariants({ size: 'sm' })}>
              <Plus aria-hidden />
              New route
            </Link>
          ) : null
        }
      />

      <Card className="overflow-hidden">
        <SearchBar placeholder="Search routes" />

        {rows.length === 0 ? (
          <EmptyState
            title={params.q ? 'No routes match that search' : 'No routes yet'}
            description="A route is an ordered list of stops with pickup times. Children are assigned to a stop, not to a bus."
            action={
              ctx.can('transport.manage') ? (
                <Link href="/transport/routes/new" className={buttonVariants({ size: 'sm' })}>
                  Create a route
                </Link>
              ) : undefined
            }
          />
        ) : (
          <>
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <TH>Route</TH>
                    <TH>Bus</TH>
                    <TH>Driver</TH>
                    <TH>First pickup</TH>
                    <TH align="right">Stops</TH>
                    <TH align="right">Riders</TH>
                    <TH>Status</TH>
                  </tr>
                </THead>
                <TBody>
                  {rows.map((route) => {
                    const notPlotted = route.stops.filter((s) => s.latitude === null).length
                    return (
                      <TR key={route.id}>
                        <TD>
                          <Link
                            href={`/transport/routes/${route.id}`}
                            className="text-sm font-medium text-ink hover:text-[var(--brand-600)]"
                          >
                            {route.name}
                          </Link>
                          <span className="block text-xs text-ink-subtle">
                            {route.code}
                            {route.distanceKm ? ` · ${route.distanceKm} km` : ''}
                          </span>
                        </TD>
                        <TD>
                          {route.bus ? (
                            <Link
                              href={`/transport/buses/${route.bus.id}`}
                              className="text-sm text-ink hover:text-[var(--brand-600)]"
                            >
                              {route.bus.code}
                            </Link>
                          ) : (
                            <span className="text-ink-subtle">No bus</span>
                          )}
                        </TD>
                        <TD>
                          {route.bus?.driver
                            ? `${route.bus.driver.firstName} ${route.bus.driver.lastName}`
                            : '—'}
                        </TD>
                        <TD className="tnum">{route.stops[0]?.pickupTime ?? '—'}</TD>
                        <TD align="right">
                          <span className="tnum">{route.stops.length}</span>
                          {notPlotted > 0 ? (
                            <Badge tone="warning" className="ml-1.5">
                              {notPlotted} unplotted
                            </Badge>
                          ) : null}
                        </TD>
                        <TD align="right" className="tnum">
                          {route._count.assignments}
                          {route.bus ? (
                            <span className="text-ink-subtle"> / {route.bus.capacity}</span>
                          ) : null}
                        </TD>
                        <TD>
                          <Badge tone={route.isActive ? 'success' : 'neutral'}>
                            {route.isActive ? 'Running' : 'Suspended'}
                          </Badge>
                        </TD>
                      </TR>
                    )
                  })}
                </TBody>
              </Table>
            </TableWrap>
            <Pagination total={total} page={query.page} pageSize={query.pageSize} label="routes" />
          </>
        )}
      </Card>
    </div>
  )
}
