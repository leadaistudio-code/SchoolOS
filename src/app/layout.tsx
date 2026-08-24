import type { Metadata, Viewport } from 'next'
import { Golos_Text } from 'next/font/google'
import Script from 'next/script'
import '@/styles/globals.css'
import { resolveTenant } from '@/server/tenant'
import { BrandStyle } from '@/components/brand-provider'
import { ThemeScript } from '@/components/theme-toggle'
import { env } from '@/lib/env'

/**
 * Loaded through next/font so the file is self-hosted and there is no
 * render-blocking request to a third-party font CDN.
 */
const golos = Golos_Text({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
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
