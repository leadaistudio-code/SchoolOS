import Link from 'next/link'
import { Boxes, Package, Tags } from 'lucide-react'
import { requireContext } from '@/server/context'
import { listAssetCategories, listAssets } from '@/server/modules/inventory/service'
import { ColorBanner, ColorTile } from '@/components/dashboard/color-tiles'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { CreateAssetForm } from './forms'
import { formatNumber } from '@/lib/utils'

export const metadata = { title: 'Inventory' }

export default async function InventoryPage() {
  const ctx = await requireContext('inventory.view')
  const [assets, categories] = await Promise.all([listAssets(ctx), listAssetCategories(ctx)])
  const disposed = assets.filter((a) => a.condition === 'DISPOSED').length

  return (
    <div className="space-y-4">
      <ColorBanner
        tone="pending"
        eyebrow="Inventory"
        title={
          assets.length > 0
            ? `${formatNumber(assets.length)} assets on register`
            : 'School assets and equipment'
        }
        description="Furniture, devices and equipment across the campus."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <ColorTile
          label="Assets"
          value={formatNumber(assets.length)}
          sub="Registered items"
          tone="pending"
          href="#assets"
          icon={<Package className="size-5" aria-hidden />}
          delayMs={40}
        />
        <ColorTile
          label="Categories"
          value={formatNumber(categories.length)}
          sub="Asset groups"
          tone="admissions"
          href="#assets"
          icon={<Tags className="size-5" aria-hidden />}
          delayMs={80}
        />
        <ColorTile
          label="Disposed"
          value={formatNumber(disposed)}
          sub="Written off"
          tone="overdue"
          href="#assets"
          icon={<Boxes className="size-5" aria-hidden />}
          delayMs={120}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card id="assets" variant="elevated" className="scroll-mt-20">
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
          <Card variant="elevated">
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
