'use client'

import Link from 'next/link'
import { FileDown } from 'lucide-react'
import { BulkSelectionBar, downloadCsv, useBulkSelection } from '@/components/bulk-selection'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/input'
import { Pagination } from '@/components/pagination'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'

type RouteRow = {
  id: string
  name: string
  code: string
  distanceKm: number | null
  isActive: boolean
  bus: {
    id: string
    code: string
    capacity: number
    driver: { firstName: string; lastName: string } | null
  } | null
  stops: {
    pickupTime: string | null
    latitude: number | null
  }[]
  riderCount: number
}

export function RouteTable({
  rows,
  total,
  page,
  pageSize,
  canExport,
}: {
  rows: RouteRow[]
  total: number
  page: number
  pageSize: number
  canExport: boolean
}) {
  const selection = useBulkSelection(rows.map((row) => row.id))
  const selectedRows = rows.filter((row) => selection.selected.has(row.id))

  return (
    <>
      {canExport ? (
        <BulkSelectionBar count={selection.selected.size} noun="route" onClear={selection.clear}>
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            downloadCsv(
              'transport-routes.csv',
              ['Route', 'Code', 'Bus', 'Driver', 'First pickup', 'Stops', 'Riders', 'Status'],
              selectedRows.map((route) => [
                route.name,
                route.code,
                route.bus?.code,
                route.bus?.driver
                  ? `${route.bus.driver.firstName} ${route.bus.driver.lastName}`
                  : '',
                route.stops[0]?.pickupTime,
                route.stops.length,
                route.riderCount,
                route.isActive ? 'Running' : 'Suspended',
              ]),
            )
          }
        >
          <FileDown aria-hidden />
          Export
        </Button>
        </BulkSelectionBar>
      ) : null}
      <TableWrap>
        <Table>
          <THead>
            <tr>
              {canExport ? (
                <TH>
                  <Checkbox
                    aria-label="Select all routes"
                    checked={selection.allSelected}
                    onChange={selection.toggleAll}
                  />
                </TH>
              ) : null}
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
              const notPlotted = route.stops.filter((stop) => stop.latitude === null).length
              return (
                <TR key={route.id}>
                  {canExport ? (
                    <TD>
                      <Checkbox
                        aria-label={`Select ${route.name}`}
                        checked={selection.selected.has(route.id)}
                        onChange={() => selection.toggle(route.id)}
                      />
                    </TD>
                  ) : null}
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
                    {route.riderCount}
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
      <Pagination total={total} page={page} pageSize={pageSize} label="routes" />
    </>
  )
}
