import Link from 'next/link'
import { Plus } from 'lucide-react'
import { requireContext } from '@/server/context'
import { documentAlerts, listBuses } from '@/server/modules/transport/service'
import { parseListQuery } from '@/lib/query'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { buttonVariants } from '@/components/ui/button-variants'
import { SearchBar } from '@/components/search-bar'
import { Pagination } from '@/components/pagination'
import { BusAvatar } from '@/components/transport/bus-glyph'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'

export const metadata = { title: 'Buses' }

export default async function BusesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireContext('transport.view')
  const params = await searchParams
  const query = parseListQuery(params)
  const { rows, total } = await listBuses(ctx, query)

  return (
    <div>
      <PageHeader
        title="Buses"
        description={`${total} vehicle${total === 1 ? '' : 's'} in the fleet`}
        breadcrumbs={[{ label: 'Transport', href: '/transport' }, { label: 'Buses' }]}
        actions={
          ctx.can('transport.manage') ? (
            <Link href="/transport/buses/new" className={buttonVariants({ size: 'sm' })}>
              <Plus aria-hidden />
              Add bus
            </Link>
          ) : null
        }
      />

      <Card className="overflow-hidden">
        <SearchBar placeholder="Search by code, registration or model" />

        {rows.length === 0 ? (
          <EmptyState
            title={params.q ? 'No buses match that search' : 'No buses yet'}
            description="A bus needs a code, a registration number and a capacity. Routes and drivers can follow."
            action={
              ctx.can('transport.manage') ? (
                <Link href="/transport/buses/new" className={buttonVariants({ size: 'sm' })}>
                  Add a bus
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
                    <TH>Bus</TH>
                    <TH>Model</TH>
                    <TH>Route</TH>
                    <TH>Driver</TH>
                    <TH align="right">Occupancy</TH>
                    <TH>Papers</TH>
                    <TH>Status</TH>
                  </tr>
                </THead>
                <TBody>
                  {rows.map((bus) => {
                    const alerts = documentAlerts(bus)
                    const expired = alerts.filter((a) => a.expired)
                    const full = bus._count.assignments >= bus.capacity

                    return (
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
                        <TD>{bus.model ?? '—'}</TD>
                        <TD>
                          {bus.routes[0] ? (
                            <Link
                              href={`/transport/routes/${bus.routes[0].id}`}
                              className="text-sm text-ink hover:text-[var(--brand-600)]"
                            >
                              {bus.routes[0].name}
                            </Link>
                          ) : (
                            <span className="text-ink-subtle">Unassigned</span>
                          )}
                        </TD>
                        <TD>
                          {bus.driver ? (
                            <span>
                              <span className="block text-sm text-ink">
                                {bus.driver.firstName} {bus.driver.lastName}
                              </span>
                              {bus.driver.phone ? (
                                <span className="block text-xs text-ink-subtle tnum">
                                  {bus.driver.phone}
                                </span>
                              ) : null}
                            </span>
                          ) : (
                            <span className="text-sm text-[var(--danger)]">No driver</span>
                          )}
                        </TD>
                        <TD align="right">
                          <span className={full ? 'tnum text-warning font-medium' : 'tnum'}>
                            {bus._count.assignments}
                            <span className="text-ink-subtle"> / {bus.capacity}</span>
                          </span>
                        </TD>
                        <TD>
                          {alerts.length === 0 ? (
                            <span className="text-ink-subtle">In order</span>
                          ) : (
                            <Badge tone={expired.length > 0 ? 'danger' : 'warning'}>
                              {expired.length > 0
                                ? `${expired.length} expired`
                                : `${alerts.length} due soon`}
                            </Badge>
                          )}
                        </TD>
                        <TD>
                          <Badge tone={bus.isActive ? 'success' : 'neutral'}>
                            {bus.isActive ? 'In service' : 'Off road'}
                          </Badge>
                        </TD>
                      </TR>
                    )
                  })}
                </TBody>
              </Table>
            </TableWrap>
            <Pagination total={total} page={query.page} pageSize={query.pageSize} label="buses" />
          </>
        )}
      </Card>
    </div>
  )
}
