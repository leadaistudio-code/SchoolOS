import Link from 'next/link'
import { requireContext } from '@/server/context'
import { listStudentFeeAccounts } from '@/server/modules/finance/simplicity'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { Pagination } from '@/components/pagination'
import { formatMoney } from '@/lib/utils'

export const metadata = { title: 'Fee ledger' }

export default async function FeeStudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>
}) {
  const ctx = await requireContext('fees.accounts')
  const params = await searchParams
  const page = Math.max(1, Number(params.page) || 1)
  const result = await listStudentFeeAccounts(ctx, { q: params.q, page, pageSize: 25 })
  const currency = ctx.tenant.currency

  return (
    <div className="space-y-4">
      <PageHeader
        title="Ledger"
        description="One clear fee account for every student"
      />
      <Card>
        <CardContent>
          <form className="flex max-w-xl gap-2" action="/finance/students">
            <Input
              name="q"
              defaultValue={params.q}
              placeholder="Search name, admission number, parent or mobile"
              aria-label="Search student fee accounts"
            />
            <Button type="submit" variant="secondary">Search</Button>
          </form>
        </CardContent>
      </Card>
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Student name</TH>
                  <TH>Admission no.</TH>
                  <TH>Class</TH>
                  <TH>Section</TH>
                  <TH align="right">Last Session Due</TH>
                  <TH align="right">Amount Requested</TH>
                  <TH align="right">Discount</TH>
                  <TH align="right">Amount Paid</TH>
                  <TH align="right">Balance</TH>
                </tr>
              </THead>
              <TBody>
                {result.rows.map((student) => (
                  <TR key={student.id}>
                    <TD>
                      <Link
                        className="text-sm font-medium text-ink hover:text-[var(--brand-600)] hover:underline"
                        href={`/finance/students/${student.id}`}
                      >
                        {student.name}
                      </Link>
                    </TD>
                    <TD className="whitespace-nowrap text-xs tnum text-ink-muted">{student.admissionNo}</TD>
                    <TD className="whitespace-nowrap text-sm">{student.className}</TD>
                    <TD className="whitespace-nowrap text-sm">{student.sectionName}</TD>
                    <TD align="right" className="whitespace-nowrap tnum">{formatMoney(student.lastSessionDueMinor, currency)}</TD>
                    <TD align="right" className="whitespace-nowrap tnum">{formatMoney(student.amountRequestedMinor, currency)}</TD>
                    <TD align="right" className="tnum">{formatMoney(student.discountMinor, currency)}</TD>
                    <TD align="right" className="whitespace-nowrap tnum">{formatMoney(student.paidMinor, currency)}</TD>
                    <TD align="right" className="whitespace-nowrap font-semibold tnum">
                      <span className={student.balanceMinor > 0 ? 'text-[var(--danger)]' : 'text-success'}>
                        {formatMoney(student.balanceMinor, currency)}
                      </span>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
          <Pagination total={result.total} page={page} pageSize={25} label="accounts" />
        </CardContent>
      </Card>
    </div>
  )
}
