import type { MetadataRoute } from 'next'
import { resolveTenant } from '@/server/tenant'
import { env } from '@/lib/env'

/**
 * Per-tenant PWA manifest. Each school installs an app with its own name,
 * icon and theme colour rather than a generic vendor shell.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const tenant = await resolveTenant()
  const school = tenant?.school
  const name = school?.pwaName?.trim() || school?.name || env().APP_NAME
  const shortName = school?.pwaShortName?.trim() || school?.code || env().APP_NAME
  const themeColor = school?.pwaThemeHex || school?.primaryHex || '#E41F07'
  const icon = school?.faviconUrl || school?.logoUrl

  return {
    name,
    short_name: shortName,
    description: `${name} school management portal`,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: themeColor,
    icons: icon
      ? [
          { src: icon, sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: icon, sizes: '512x512', type: 'image/png', purpose: 'any' },
        ]
      : [],
  }
}
