import { requireContext } from '@/server/context'
import { concessionStudents, listConcessions, listFeeHeads } from '@/server/modules/finance/service'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { formatMoney } from '@/lib/utils'
import { ConcessionForm } from './concession-form'

export const metadata = { title: 'Concessions' }

export default async function ConcessionsPage() {
  const ctx = await requireContext('fees.concession')
  const [concessions, students, feeHeads] = await Promise.all([listConcessions(ctx), concessionStudents(ctx), listFeeHeads(ctx)])
  return <div className="space-y-4">
    <PageHeader title="Concessions" description="Discounts applied automatically when future invoices are generated." actions={<ConcessionForm students={students} feeHeads={feeHeads.map(({ id, name }) => ({ id, name }))} />} />
    <Card className="overflow-hidden"><CardContent className="p-0">
      {concessions.length === 0 ? <EmptyState title="No concessions yet" description="Grant a sibling discount, scholarship or staff-ward concession before generating invoices." /> : <TableWrap><Table><THead><tr><TH>Student</TH><TH>Concession</TH><TH>Applies to</TH><TH>Validity</TH><TH align="right">Value</TH></tr></THead><TBody>{concessions.map((concession) => <TR key={concession.id}><TD><p className="text-sm text-ink">{concession.student.firstName} {concession.student.lastName}</p><p className="text-xs text-ink-subtle">{concession.student.admissionNo}</p></TD><TD><p className="text-sm text-ink">{concession.name}</p>{concession.reason ? <p className="text-xs text-ink-subtle truncate max-w-56">{concession.reason}</p> : null}</TD><TD><Badge>{concession.feeHeadId ? 'One fee head' : 'All fee heads'}</Badge></TD><TD className="text-xs text-ink-muted">{concession.validFrom ? concession.validFrom.toLocaleDateString('en-IN') : 'From now'} — {concession.validTo ? concession.validTo.toLocaleDateString('en-IN') : 'No end date'}</TD><TD align="right" className="text-sm font-medium text-ink">{concession.kind === 'PERCENT' ? `${concession.value}%` : formatMoney(concession.value, ctx.tenant.currency)}</TD></TR>)}</TBody></Table></TableWrap>}
    </CardContent></Card>
  </div>
}
