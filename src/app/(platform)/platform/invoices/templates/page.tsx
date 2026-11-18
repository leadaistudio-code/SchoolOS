import Link from 'next/link'
import { requirePlatformContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button-variants'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { listTemplates } from '@/server/modules/platform/commercial-invoices'
import { parseTemplateBody } from '@/server/modules/platform/commercial-invoice-templates'
import { duplicateTemplateAction } from '../actions'

export const metadata = { title: 'Invoice templates · Platform' }

export default async function InvoiceTemplatesPage() {
  const ctx = await requirePlatformContext('platform.billing')
  const templates = await listTemplates(ctx)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Invoice templates"
        description="Three samples ship by default. Edit any template or duplicate it for a school-specific look."
        actions={
          <Link href="/platform/invoices" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
            Invoices
          </Link>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {templates.map((t) => {
          const body = parseTemplateBody(t.body)
          return (
            <Card key={t.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2">
                  <span>{t.name}</span>
                  {t.isSample ? <Badge tone="neutral">Sample</Badge> : null}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="text-ink-muted">
                  Layout <span className="font-medium text-ink">{body.layout}</span>
                </p>
                <p className="text-ink-muted">
                  From {body.from.brand} · {body.from.email}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/platform/invoices/templates/${t.id}`}
                    className={buttonVariants({ size: 'sm' })}
                  >
                    Edit
                  </Link>
                  <form action={duplicateTemplateAction.bind(null, t.id)}>
                    <button type="submit" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                      Duplicate
                    </button>
                  </form>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
