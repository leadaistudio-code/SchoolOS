import Link from 'next/link'
import { format } from 'date-fns'
import { notFound } from 'next/navigation'
import { requireContext } from '@/server/context'
import { getAsset } from '@/server/modules/inventory/service'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AssetLifecycleForm } from '../forms'

export const metadata = { title: 'Asset' }

export default async function AssetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireContext('inventory.view')
  let asset
  try {
    asset = await getAsset(ctx, id)
  } catch {
    notFound()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={asset.name}
        description={`${asset.assetCode}${asset.location ? ` · ${asset.location}` : ''}`}
        actions={
          <Link href="/inventory" className="text-sm text-[var(--brand-600)] hover:underline">
            Back
          </Link>
        }
      />

      <Badge tone="neutral">{asset.condition.replaceAll('_', ' ')}</Badge>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>History</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {asset.history.map((h) => (
              <div key={h.id} className="border-t border-line pt-3 first:border-0 first:pt-0">
                <p className="text-xs text-ink-subtle">
                  {h.action} · {format(h.occurredAt, 'd MMM yyyy HH:mm')}
                </p>
                {h.notes ? <p className="text-sm text-ink-muted mt-0.5">{h.notes}</p> : null}
              </div>
            ))}
          </CardContent>
        </Card>

        {ctx.can('inventory.manage') && asset.condition !== 'DISPOSED' ? (
          <Card>
            <CardHeader>
              <CardTitle>Lifecycle action</CardTitle>
            </CardHeader>
            <CardContent>
              <AssetLifecycleForm assetId={asset.id} />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  )
}
