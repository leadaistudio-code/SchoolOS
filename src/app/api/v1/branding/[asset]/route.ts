import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/server/tenant'
import { readBrandingAsset, type BrandingAssetKind } from '@/server/branding-assets'

const ALLOWED = new Set<BrandingAssetKind>([
  'logo',
  'banner',
  'favicon',
  'darkLogo',
  'signature',
  'letterheadHeader',
  'letterheadFooter',
])

/**
 * GET /api/v1/branding/{logo|banner|favicon|darkLogo|signature|letterheadHeader|letterheadFooter}
 *
 * Public, tenant-scoped branding images. Resolved from Host — no session.
 */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ asset: string }> },
) {
  const { asset } = await context.params
  if (!ALLOWED.has(asset as BrandingAssetKind)) {
    return new Response('Not found', { status: 404 })
  }

  const tenant = await resolveTenant()
  if (!tenant) return new Response('Not found', { status: 404 })

  const file = await readBrandingAsset(tenant.id, asset as BrandingAssetKind)
  if (!file) return new Response('Not found', { status: 404 })

  return new Response(new Uint8Array(file.body), {
    headers: {
      'Content-Type': file.mimeType,
      'Content-Length': String(file.body.length),
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
