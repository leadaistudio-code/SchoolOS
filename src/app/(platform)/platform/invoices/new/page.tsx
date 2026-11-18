import Link from 'next/link'
import { requirePlatformContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ensureSampleTemplates, listTemplates } from '@/server/modules/platform/commercial-invoices'
import { createCommercialInvoiceAction } from '../actions'
import { InvoiceLinesEditor } from '../lines-editor'

export const metadata = { title: 'New invoice · Platform' }

export default async function NewCommercialInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const ctx = await requirePlatformContext('platform.billing')
  const sp = await searchParams
  await ensureSampleTemplates(ctx.db)
  const [templates, tenants] = await Promise.all([
    listTemplates(ctx),
    ctx.db.tenant.findMany({
      where: { status: { in: ['ACTIVE', 'TRIAL', 'PAST_DUE'] } },
      select: {
        id: true,
        name: true,
        slug: true,
        school: { select: { name: true } },
        subscription: { select: { cycle: true, status: true } },
      },
      orderBy: { name: 'asc' },
    }),
  ])

  return (
    <div className="space-y-4">
      <PageHeader
        title="New commercial invoice"
        description="Tag a school, pick a template, add line items. Enable monthly auto only for MONTHLY subscriptions."
        actions={
          <Link href="/platform/invoices" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
            Back
          </Link>
        }
      />

      {sp.error ? (
        <p className="rounded-[var(--radius-sm)] border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {sp.error}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Invoice details</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createCommercialInvoiceAction} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs text-ink-muted">School</span>
                <select
                  name="tenantId"
                  required
                  className="h-9 w-full rounded-[var(--radius-sm)] border border-line px-2 text-sm"
                >
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.school?.name ?? t.name} ({t.slug})
                      {t.subscription?.cycle === 'MONTHLY' ? ' · MONTHLY' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs text-ink-muted">Template</span>
                <select
                  name="templateId"
                  required
                  className="h-9 w-full rounded-[var(--radius-sm)] border border-line px-2 text-sm"
                >
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.isSample ? ' (sample)' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs text-ink-muted">Status</span>
                <select name="status" defaultValue="DUE" className="h-9 w-full rounded-[var(--radius-sm)] border border-line px-2 text-sm">
                  <option value="DUE">Due</option>
                  <option value="DRAFT">Draft</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs text-ink-muted">Due in days</span>
                <Input name="dueInDays" type="number" defaultValue={14} />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 sm:col-span-2">
                <span className="text-xs text-ink-muted">Bill to name</span>
                <Input name="billToName" placeholder="Defaults to school name" />
              </label>
              <label className="space-y-1 sm:col-span-2">
                <span className="text-xs text-ink-muted">Bill to address</span>
                <textarea
                  name="billToAddress"
                  rows={3}
                  className="w-full rounded-[var(--radius-sm)] border border-line px-3 py-2 text-sm"
                  placeholder="Optional — defaults from school profile"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-ink-muted">Attn</span>
                <Input name="billToAttn" placeholder="Owner / principal" />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-ink-muted">Email</span>
                <Input name="billToEmail" type="email" />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-ink-muted">Advance received (₹)</span>
                <Input name="advanceRupees" type="number" min={0} step="1" defaultValue={0} />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-ink-muted">Payment ref (optional)</span>
                <Input name="paymentRef" placeholder="pay_…" />
              </label>
            </div>

            <InvoiceLinesEditor />

            <label className="space-y-1 block">
              <span className="text-xs text-ink-muted">Notes</span>
              <textarea
                name="notes"
                rows={3}
                className="w-full rounded-[var(--radius-sm)] border border-line px-3 py-2 text-sm"
                placeholder="Leave blank to use template default notes"
              />
            </label>

            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="autoMonthly" className="mt-1" />
              <span>
                Use as monthly auto schedule
                <span className="block text-xs text-ink-muted">
                  Only works when the school&apos;s subscription cycle is MONTHLY. Cron clones this invoice each month.
                </span>
              </span>
            </label>

            <div className="flex gap-2">
              <Button type="submit">Create invoice</Button>
              <Link href="/platform/invoices" className={buttonVariants({ variant: 'secondary' })}>
                Cancel
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
