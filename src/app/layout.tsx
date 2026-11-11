import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import Script from 'next/script'
import '@/styles/globals.css'
import { resolveTenant } from '@/server/tenant'
import { BrandStyle } from '@/components/brand-provider'
import { ThemeScript } from '@/components/theme-toggle'
import { env } from '@/lib/env'

/**
 * Self-hosted through next/font, so there is no render-blocking request to a
 * third-party font CDN. The file is committed rather than fetched through
 * `next/font/google` for the same reason as the display face: the Google
 * loader in Next 15.5 crashes when Google returns a file URL without an
 * extension, which fails the production build. Golos Text's variable latin
 * subset, so one file covers 400–700.
 */
const golos = localFont({
  src: '../lib/fonts/golos-latin.woff2',
  weight: '400 700',
  variable: '--font-golos',
  display: 'swap',
})

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await resolveTenant()
  const name = tenant?.school?.name ?? tenant?.name ?? env().APP_NAME
  return {
    title: { default: name, template: `%s · ${name}` },
    description: `${name} school management portal`,
    manifest: '/manifest.webmanifest',
    // Undefined on purpose: Next then falls back to `src/app/icon.png` and
    // `src/app/apple-icon.png`, which carry the MyCampusView symbol.
    icons: tenant?.school?.faviconUrl ? { icon: tenant.school.faviconUrl } : undefined,
    appleWebApp: { capable: true, title: name, statusBarStyle: 'default' },
  }
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0b111f' },
  ],
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const tenant = await resolveTenant()
  const palette = {
    primaryHex: tenant?.school?.primaryHex ?? '#635BFF',
    secondaryHex: tenant?.school?.secondaryHex ?? '#101828',
    accentHex: tenant?.school?.accentHex ?? '#F59E0B',
    radius: tenant?.school?.radius ?? '12px',
  }

  return (
    <html lang="en" className={golos.variable} suppressHydrationWarning>
      <head>
        <ThemeScript />
        <BrandStyle palette={palette} />
      </head>
      <body>
        {children}
        <Script src="https://www.googletagmanager.com/gtag/js?id=G-4V3MCWL024" strategy="afterInteractive" />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());

            gtag('config', 'G-4V3MCWL024');
          `}
        </Script>
      </body>
    </html>
  )
}
