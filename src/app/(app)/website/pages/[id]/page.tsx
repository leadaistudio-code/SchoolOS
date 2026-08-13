import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireContext } from '@/server/context'
import { getPage } from '@/server/modules/website/service'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AddBlockForm, DeleteBlockButton, UpdatePageForm } from '../../forms'

export const metadata = { title: 'Edit page' }

export default async function WebsitePageEditor({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const ctx = await requireContext('website.view')
  let page
  try {
    page = await getPage(ctx, id)
  } catch {
    notFound()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={page.title}
        description={`/${page.slug}`}
        actions={
          <Link href="/website" className="text-sm text-[var(--brand-600)] hover:underline">
            Back
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {ctx.can('website.manage') ? (
          <Card>
            <CardHeader>
              <CardTitle>Page settings</CardTitle>
            </CardHeader>
            <CardContent>
              <UpdatePageForm page={page} />
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Blocks · {page.blocks.length}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {page.blocks.map((block) => (
              <div key={block.id} className="rounded-[var(--radius-sm)] border border-line p-3">
                <div className="flex items-center justify-between gap-2">
                  <Badge tone="neutral">{block.kind}</Badge>
                  {ctx.can('website.manage') ? (
                    <DeleteBlockButton pageId={page.id} blockId={block.id} />
                  ) : null}
                </div>
                {block.heading ? (
                  <p className="mt-2 text-sm font-medium text-ink">{block.heading}</p>
                ) : null}
                {block.body ? (
                  <p className="mt-1 text-sm text-ink-muted whitespace-pre-wrap">{block.body}</p>
                ) : null}
              </div>
            ))}
            {ctx.can('website.manage') ? (
              <div className="pt-2">
                <AddBlockForm pageId={page.id} />
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
