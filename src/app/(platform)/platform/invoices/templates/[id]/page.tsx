import Link from 'next/link'
import { requirePlatformContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { getTemplate } from '@/server/modules/platform/commercial-invoices'
import { parseTemplateBody } from '@/server/modules/platform/commercial-invoice-templates'
import { updateTemplateAction } from '../../actions'

export const metadata = { title: 'Edit template · Platform' }

export default async function EditInvoiceTemplatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ saved?: string }>
}) {
  const ctx = await requirePlatformContext('platform.billing')
  const { id } = await params
  const sp = await searchParams
  const template = await getTemplate(ctx, id)
  const body = parseTemplateBody(template.body)

  return (
    <div className="space-y-4">
      <PageHeader
        title={template.name}
        description={`Code ${template.code}${template.isSample ? ' · sample' : ''}`}
        actions={
          <Link href="/platform/invoices/templates" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
            All templates
          </Link>
        }
      />

      {sp.saved ? (
        <p className="rounded-[var(--radius-sm)] border border-line bg-surface-2 px-3 py-2 text-sm text-ink">
          Template saved.
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Edit template</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updateTemplateAction.bind(null, template.id)} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs text-ink-muted">Name</span>
                <Input name="name" defaultValue={template.name} required />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-ink-muted">Layout</span>
                <select
                  name="layout"
                  defaultValue={body.layout}
                  className="h-9 w-full rounded-[var(--radius-sm)] border border-line px-2 text-sm"
                >
                  <option value="classic_white">Classic white</option>
                  <option value="brand_header">Brand header</option>
                  <option value="compact">Compact</option>
                </select>
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs text-ink-muted">From brand</span>
                <Input name="fromBrand" defaultValue={body.from.brand} />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-ink-muted">Legal name</span>
                <Input name="fromLegalName" defaultValue={body.from.legalName} />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-ink-muted">Website</span>
                <Input name="fromWebsite" defaultValue={body.from.website} />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-ink-muted">Email</span>
                <Input name="fromEmail" defaultValue={body.from.email} />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="space-y-1">
                <span className="text-xs text-ink-muted">Document title</span>
                <Input name="labelDocumentTitle" defaultValue={body.labels.documentTitle} />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-ink-muted">From label</span>
                <Input name="labelFrom" defaultValue={body.labels.from} />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-ink-muted">Bill-to label</span>
                <Input name="labelBillTo" defaultValue={body.labels.billTo} />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-ink-muted">Notes label</span>
                <Input name="labelNotes" defaultValue={body.labels.notes} />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-ink-muted">Payment label</span>
                <Input name="labelPayment" defaultValue={body.labels.paymentReceived} />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-ink-muted">Footer</span>
                <Input name="footer" defaultValue={body.footer} />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {(
                [
                  ['colorInk', 'Ink', body.colors.ink],
                  ['colorInkSoft', 'Ink soft', body.colors.inkSoft],
                  ['colorRule', 'Rule', body.colors.rule],
                  ['colorWash', 'Wash', body.colors.wash],
                  ['colorAccent', 'Accent', body.colors.accent],
                ] as const
              ).map(([name, label, value]) => (
                <label key={name} className="space-y-1">
                  <span className="text-xs text-ink-muted">{label}</span>
                  <Input name={name} type="color" defaultValue={value} />
                </label>
              ))}
            </div>

            <label className="space-y-1 block">
              <span className="text-xs text-ink-muted">Default notes (one per line)</span>
              <textarea
                name="defaultNotes"
                rows={4}
                className="w-full rounded-[var(--radius-sm)] border border-line px-3 py-2 text-sm"
                defaultValue={body.defaultNotes.join('\n')}
              />
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="showAdvance" defaultChecked={body.showAdvance} />
              Show advance / balance section on invoices
            </label>

            <Button type="submit">Save template</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
