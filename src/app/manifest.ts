import type { MetadataRoute } from 'next'
import { resolveTenant } from '@/server/tenant'
import { env } from '@/lib/env'

/**
 * Per-tenant PWA manifest. Each school installs an app with its own name,
 * icon and theme colour rather than a generic vendor shell.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const tenant = await resolveTenant()
  const name = tenant?.school?.name ?? env().APP_NAME
  const themeColor = tenant?.school?.primaryHex ?? '#E41F07'

  return {
    name,
    short_name: tenant?.school?.code ?? env().APP_NAME,
    description: `${name} school management portal`,
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: themeColor,
    icons: tenant?.school?.faviconUrl
      ? [{ src: tenant.school.faviconUrl, sizes: 'any', type: 'image/png' }]
      : [],
  }
}
