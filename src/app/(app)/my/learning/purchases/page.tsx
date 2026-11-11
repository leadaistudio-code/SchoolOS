import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireLms } from '@/server/modules/lms/access'
import { formatRupees, isAcademy, myOrders } from '@/server/modules/lms/academy'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { buttonVariants } from '@/components/ui/button-variants'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { formatIst } from '@/lib/ist-clock'

export const metadata = { title: 'Purchases' }

export default async function PurchasesPage() {
  const ctx = await requireLms('lms.learn')
  if (!isAcademy(ctx.tenant)) notFound()
  const orders = await myOrders(ctx)

  return (
    <div className="space-y-4">
      <PageHeader title="Purchases" description="Courses you have bought, with their order numbers for any query." />
      <Card className="overflow-hidden">
        {orders.length === 0 ? (
          <EmptyState
            title="No purchases yet"
            description="Courses you buy appear here."
            action={<Link href="/academy" className={buttonVariants()}>Browse courses</Link>}
          />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Order</TH>
                  <TH>Course</TH>
                  <TH>Paid on</TH>
                  <TH align="right">Amount</TH>
                </tr>
              </THead>
              <TBody>
                {orders.map((o) => (
                  <TR key={o.id}>
                    <TD className="font-mono whitespace-nowrap">{o.number}</TD>
                    <TD>
                      <Link href={`/my/learning/${o.course.id}`} className="font-medium text-ink hover:text-[var(--brand-600)]">
                        {o.course.title}
                      </Link>
                    </TD>
                    <TD className="whitespace-nowrap">{o.paidAt ? formatIst(o.paidAt, 'd MMM yyyy, h:mm a') : ''}</TD>
                    <TD align="right" className="tnum">{formatRupees(o.amountMinor)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Card>
    </div>
  )
}
