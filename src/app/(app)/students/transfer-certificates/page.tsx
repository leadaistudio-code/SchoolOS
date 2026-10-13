import Link from 'next/link'
import { Ban, CalendarRange, FileCheck2, FileOutput } from 'lucide-react'
import { requireContext } from '@/server/context'
import { listTransferCertificates } from '@/server/modules/students/transfer-certificates'
import { formatDay } from '@/lib/dates'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { SearchBar } from '@/components/search-bar'
import { Pagination } from '@/components/pagination'
import { PersonCell } from '@/components/ui/identity'
import { ACCENT, ActionLink, StatCard } from '@/components/ui/stat-card'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { StoreFilters } from '@/app/(app)/inventory/store/store-filters'
import { TcTabs } from './tc-tabs'

export const metadata = { title: 'Transfer certificates' }

export default async function TransferCertificatesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireContext('students.tc')
  const params = await searchParams
  const status = params.status === 'ISSUED' || params.status === 'CANCELLED' ? params.status : ''
  const data = await listTransferCertificates(ctx, {
    q: params.q,
    status,
    page: Number(params.page) || 1,
  })

  return (
    <div className="space-y-4">
      <PageHeader
        title="Transfer certificates"
        description="Every TC issued by the school. Open one to print it again or cancel it."
        actions={
          <ActionLink href="/students/transfer-certificates/new" icon={FileOutput} accent={ACCENT.rose}>
            Issue TC
          </ActionLink>
        }
      />
      <TcTabs active="list" />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Issued (active)" value={data.stats.issued} icon={FileCheck2} accent={ACCENT.indigo} />
        <StatCard label="This financial year" value={data.stats.thisYear} icon={CalendarRange} accent={ACCENT.emerald} />
        <StatCard label="Cancelled" value={data.stats.cancelled} icon={Ban} accent={ACCENT.rose} />
      </div>

      <Card className="overflow-hidden">
        <SearchBar placeholder="Search TC no., book no., student or admission no.">
          <StoreFilters
            filters={[
              {
                param: 'status',
                label: 'Status',
                allLabel: 'All',
                options: [
                  { value: 'ISSUED', label: 'Issued' },
                  { value: 'CANCELLED', label: 'Cancelled' },
                ],
              },
            ]}
          />
        </SearchBar>
        {data.rows.length === 0 ? (
          <EmptyState
            title="No transfer certificates yet"
            description="Issued certificates are listed here for reprinting."
          />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>TC no.</TH>
                  <TH>Student</TH>
                  <TH>Class left</TH>
                  <TH>Issued on</TH>
                  <TH>Reason</TH>
                  <TH>Issued by</TH>
                  <TH>Status</TH>
                </tr>
              </THead>
              <TBody>
                {data.rows.map((r) => (
                  <TR key={r.id} className={r.status === 'CANCELLED' ? 'opacity-60' : undefined}>
                    <TD>
                      <Link
                        href={`/students/transfer-certificates/${r.id}`}
                        className="font-medium text-[var(--brand-600)] hover:underline"
                      >
                        {r.number}
                      </Link>
                      {r.bookNo ? <p className="text-xs text-ink-subtle">Book {r.bookNo}</p> : null}
                    </TD>
                    <TD>
                      <PersonCell
                        firstName={r.student.firstName}
                        lastName={r.student.lastName}
                        avatarUrl={r.student.photoUrl}
                        secondary={r.student.admissionNo}
                        href={`/students/${r.student.id}`}
                      />
                    </TD>
                    <TD>{r.lastClass || '—'}</TD>
                    <TD className="whitespace-nowrap">{formatDay(r.issuedOn, 'd MMM yyyy')}</TD>
                    <TD className="max-w-56 truncate">{r.reason ?? '—'}</TD>
                    <TD>{r.issuedByLabel ?? '—'}</TD>
                    <TD>
                      <StatusBadge
                        status={r.status}
                        tone={r.status === 'CANCELLED' ? 'danger' : 'success'}
                        label={r.status === 'CANCELLED' ? 'Cancelled' : 'Issued'}
                      />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
        <Pagination total={data.total} page={data.page} pageSize={data.pageSize} label="certificates" />
      </Card>
    </div>
  )
}
