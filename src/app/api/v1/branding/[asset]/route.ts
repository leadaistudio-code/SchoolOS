import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/server/tenant'
import { readBrandingAsset, type BrandingAssetKind } from '@/server/branding-assets'

/**
 * GET /api/v1/branding/logo | /api/v1/branding/banner
 *
 * Public, tenant-scoped branding images for the sign-in page and shell.
 * Resolved from the request Host header — no session required.
 */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ asset: string }> },
) {
  const { asset } = await context.params
  if (asset !== 'logo' && asset !== 'banner') {
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
