import { ExternalLink } from 'lucide-react'
import { requirePlatformContext } from '@/server/context'
import { academyOverview, academyUrl, formatRupees, paymentMode } from '@/server/modules/lms/academy'
import { env } from '@/lib/env'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge, StatusBadge } from '@/components/ui/badge'
import { Metric } from '@/components/ui/metric'
import { EmptyState, Notice } from '@/components/ui/states'
import { buttonVariants } from '@/components/ui/button-variants'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { formatIst } from '@/lib/ist-clock'
import { CopyText, PriceInput, SetupAcademyForm } from './academy-forms'

export const metadata = { title: 'Academy · Platform' }

const ORDER_TONE = { PAID: 'success', FAILED: 'danger', CREATED: 'info', ABANDONED: 'neutral' } as const
const ORDER_LABEL = { PAID: 'Paid', FAILED: 'Failed', CREATED: 'At checkout', ABANDONED: 'Not completed' } as const

export default async function PlatformAcademyPage() {
  const ctx = await requirePlatformContext('platform.lms')
  const { academy, courses, totals, orders } = await academyOverview()
  const mode = paymentMode()
  const webhookUrl = `${new URL(env().APP_URL).origin}/api/v1/webhooks/razorpay-academy`
  const breadcrumbs = [{ label: 'Courses', href: '/platform/lms' }, { label: 'Academy' }]

  if (!academy) {
    const plans = await ctx.db.plan.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } })
    return (
      <div className="space-y-4">
        <PageHeader
          title="MyCampusView Academy"
          description="Sell Robotics & AI courses to the public: sign-up, Razorpay checkout and the same course player schools use."
          breadcrumbs={breadcrumbs}
        />
        <Card>
          <CardHeader>
            <CardTitle>Set up the Academy</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-ink-muted">
              Creates a school called MyCampusView Academy at <strong>{academyUrl('/academy').replace(/^https?:\/\//, '')}</strong> with the
              Robotics &amp; AI add-on switched on. Public learners join it from its course pages; its administrator runs live classes and
              reviews projects there like any school.
            </p>
            <SetupAcademyForm plans={plans} />
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="MyCampusView Academy"
        description="Public course sales. Set a price to list a published course; leave it blank to keep it off the Academy."
        breadcrumbs={breadcrumbs}
        actions={
          <a href={academyUrl('/academy')} target="_blank" rel="noreferrer" className={buttonVariants({ variant: 'secondary' })}>
            <ExternalLink /> Open the Academy
          </a>
        }
      />

      {mode === 'razorpay' ? (
        env().RAZORPAY_WEBHOOK_SECRET ? null : (
          <Notice tone="warning" title="Add the Razorpay webhook">
            Payments work, but a buyer who closes the tab before returning is only caught by the webhook. In Razorpay, add a webhook for
            payment.captured, payment.failed and order.paid pointing to <CopyText text={webhookUrl} /> and set its secret as
            RAZORPAY_WEBHOOK_SECRET.
          </Notice>
        )
      ) : mode === 'simulated' ? (
        <Notice tone="info" title="Test mode">
          RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are not set, so checkout is simulated. Production never simulates: without the keys it
          does not sell at all.
        </Notice>
      ) : (
        <Notice tone="danger" title="Payments are off">
          Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to start selling. Free courses still work.
        </Notice>
      )}

      {totals ? (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <Metric label="Learners" value={String(totals.learners)} sub={`${totals.enrolments} enrolments`} />
          <Metric label="Sales" value={String(totals.paidOrders)} sub={`${totals.monthOrders} this month`} />
          <Metric label="Revenue" value={formatRupees(totals.revenueMinor)} />
          <Metric label="Revenue this month" value={formatRupees(totals.monthRevenueMinor)} />
        </div>
      ) : null}

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Courses and prices</CardTitle>
        </CardHeader>
        {courses.length === 0 ? (
          <EmptyState title="No courses yet" description="Build a course under Courses first." />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Course</TH>
                  <TH align="right">Learners</TH>
                  <TH align="right">Revenue</TH>
                  <TH align="right">Price (blank: not sold, 0: free)</TH>
                </tr>
              </THead>
              <TBody>
                {courses.map((c) => (
                  <TR key={c.id}>
                    <TD>
                      <span className="font-medium text-ink">{c.title}</span>{' '}
                      {c.status !== 'PUBLISHED' ? <StatusBadge status={c.status} /> : null}
                      {c.tenantId ? <Badge tone="info">Academy’s own</Badge> : null}
                      {c.academyPriceMinor !== null && c.status === 'PUBLISHED' ? <Badge tone="success">Listed</Badge> : null}
                    </TD>
                    <TD align="right">{c.learners}</TD>
                    <TD align="right" className="tnum">{c.revenueMinor ? formatRupees(c.revenueMinor) : '—'}</TD>
                    <TD align="right">
                      <PriceInput courseId={c.id} priceMinor={c.academyPriceMinor} title={c.title} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Recent orders</CardTitle>
        </CardHeader>
        {orders.length === 0 ? (
          <EmptyState title="No orders yet" />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>When</TH>
                  <TH>Learner</TH>
                  <TH>Course</TH>
                  <TH align="right">Amount</TH>
                  <TH>Status</TH>
                  <TH>Reference</TH>
                </tr>
              </THead>
              <TBody>
                {orders.map((o) => (
                  <TR key={o.id}>
                    <TD className="whitespace-nowrap">{formatIst(o.paidAt ?? o.createdAt, 'd MMM, h:mm a')}</TD>
                    <TD>
                      {o.learner}
                      {o.contact ? <span className="block text-xs text-ink-subtle">{o.contact}</span> : null}
                    </TD>
                    <TD>{o.course}</TD>
                    <TD align="right" className="tnum">{formatRupees(o.amountMinor)}</TD>
                    <TD>
                      <Badge tone={ORDER_TONE[o.status]}>{ORDER_LABEL[o.status]}</Badge>
                      {o.failureReason ? <span className="block text-xs text-ink-subtle">{o.failureReason}</span> : null}
                    </TD>
                    <TD className="text-xs">
                      {o.number ? <span className="block font-mono text-ink">{o.number}</span> : null}
                      {o.providerPaymentId ? <span className="block font-mono text-ink-subtle">{o.providerPaymentId}</span> : null}
                      {o.provider === 'simulated' ? <span className="text-ink-subtle">Test</span> : null}
                    </TD>
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
