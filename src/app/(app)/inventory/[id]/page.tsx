import Link from 'next/link'
import { format } from 'date-fns'
import { notFound } from 'next/navigation'
import { requireContext } from '@/server/context'
import { getAsset } from '@/server/modules/inventory/service'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatMoney } from '@/lib/utils'
import { fixedAssetsForInventoryItem } from '@/server/modules/accounting/fixed-assets-service'
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
  const fixedAssets = await fixedAssetsForInventoryItem(ctx, asset.id)
  const money = (minor: number) => formatMoney(minor, ctx.tenant.currency)

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

        {fixedAssets ? (
          <Card>
            <CardHeader>
              <CardTitle>In the books (fixed asset)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {fixedAssets.length === 0 ? (
                <p className="text-ink-muted">This item is not capitalised as a fixed asset, so it is not depreciated.</p>
              ) : (
                fixedAssets.map((f) => (
                  <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 first:border-0 first:pt-0">
                    <span>
                      <Link href={`/accounts/fixed-assets/${f.id}`} className="font-medium text-[var(--brand-600)] hover:underline">{f.code} · {f.name}</Link>
                      <span className="block text-xs text-ink-subtle">{f.method} at {(f.rateBp / 100).toFixed(2)}% · {f.status.toLowerCase()}</span>
                    </span>
                    <span className="text-right tnum">
                      <span className="block">Cost {money(f.costMinor)}</span>
                      <span className="block font-medium">Written-down value {money(f.wdvMinor)}</span>
                    </span>
                  </div>
                ))
              )}
              {fixedAssets.length === 0 && ctx.can('accounts.manage') ? (
                <Link href={`/accounts/fixed-assets?capitalise=${asset.id}`} className="inline-block text-[var(--brand-600)] hover:underline">
                  Capitalise as a fixed asset →
                </Link>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

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
