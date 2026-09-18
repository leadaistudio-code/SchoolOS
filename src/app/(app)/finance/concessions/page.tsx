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
  const feeHeadOptions = feeHeads.map(({ id, name }) => ({ id, name }))
  return <div className="space-y-4">
    <PageHeader title="Discounts" description="Student discounts update eligible current dues and future invoices." actions={<ConcessionForm students={students} feeHeads={feeHeadOptions} />} />
    <Card className="overflow-hidden"><CardContent className="p-0">
      {concessions.length === 0 ? <EmptyState title="No discounts yet" description="Grant a sibling discount, scholarship or staff-ward concession." /> : <TableWrap><Table><THead><tr><TH>Student</TH><TH>Discount</TH><TH>Applies to</TH><TH>Validity</TH><TH align="right">Value</TH><TH align="right">Actions</TH></tr></THead><TBody>{concessions.map((concession) => <TR key={concession.id}><TD><p className="text-sm text-ink">{concession.student.firstName} {concession.student.lastName}</p><p className="text-xs text-ink-subtle">{concession.student.admissionNo}</p></TD><TD><p className="text-sm text-ink">{concession.name}</p>{concession.reason ? <p className="text-xs text-ink-subtle truncate max-w-56">{concession.reason}</p> : null}</TD><TD><Badge>{concession.feeHeadId ? 'One fee head' : 'All fee heads'}</Badge></TD><TD className="text-xs text-ink-muted">{concession.validFrom ? concession.validFrom.toLocaleDateString('en-IN') : 'From now'} — {concession.validTo ? concession.validTo.toLocaleDateString('en-IN') : 'No end date'}</TD><TD align="right" className="text-sm font-medium text-ink">{concession.kind === 'PERCENT' ? `${concession.value}%` : formatMoney(concession.value, ctx.tenant.currency)}</TD><TD align="right"><ConcessionForm students={students.filter((student) => student.id === concession.studentId)} feeHeads={feeHeadOptions} concession={{ id: concession.id, studentId: concession.studentId, name: concession.name, kind: concession.kind, value: concession.kind === 'PERCENT' ? concession.value : concession.value / 100, feeHeadId: concession.feeHeadId ?? '', reason: concession.reason ?? '', validFrom: concession.validFrom?.toISOString().slice(0, 10) ?? '', validTo: concession.validTo?.toISOString().slice(0, 10) ?? '' }} /></TD></TR>)}</TBody></Table></TableWrap>}
    </CardContent></Card>
  </div>
}
