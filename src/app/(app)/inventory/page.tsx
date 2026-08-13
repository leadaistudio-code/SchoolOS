import Link from 'next/link'
import { requireContext } from '@/server/context'
import { listAssetCategories, listAssets } from '@/server/modules/inventory/service'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { CreateAssetForm } from './forms'

export const metadata = { title: 'Inventory' }

export default async function InventoryPage() {
  const ctx = await requireContext('inventory.view')
  const [assets, categories] = await Promise.all([listAssets(ctx), listAssetCategories(ctx)])

  return (
    <div className="space-y-6">
      <PageHeader title="Inventory" description="School assets and equipment." />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader>
            <CardTitle>Assets · {assets.length}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {assets.length === 0 ? (
              <EmptyState title="No assets" description="Register furniture, devices and equipment." />
            ) : (
              assets.map((asset) => (
                <Link
                  key={asset.id}
                  href={`/inventory/${asset.id}`}
                  className="flex items-center justify-between rounded-[var(--radius-sm)] border border-line p-3 hover:bg-surface-2"
                >
                  <div>
                    <p className="text-sm font-medium text-ink">{asset.name}</p>
                    <p className="text-xs text-ink-subtle tnum">
                      {asset.assetCode}
                      {asset.location ? ` · ${asset.location}` : ''}
                    </p>
                  </div>
                  <Badge tone={asset.condition === 'DISPOSED' ? 'danger' : 'neutral'}>
                    {asset.condition.replaceAll('_', ' ')}
                  </Badge>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        {ctx.can('inventory.manage') ? (
          <Card>
            <CardHeader>
              <CardTitle>Register asset</CardTitle>
            </CardHeader>
            <CardContent>
              <CreateAssetForm categories={categories} />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  )
}
