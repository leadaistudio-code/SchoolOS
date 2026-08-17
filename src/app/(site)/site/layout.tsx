import type { Metadata } from 'next'
import { Manrope } from 'next/font/google'
import '@/styles/site.css'
import { SiteNav } from '@/components/site/nav'
import { SiteFooter } from '@/components/site/footer'
import { Reveal } from '@/components/site/reveal'
import { SmoothScroll } from '@/components/site/motion/provider'
import { env } from '@/lib/env'

/**
 * One display face, headlines only.
 *
 * Manrope, at two weights, subset to latin. The application already loads
 * Golos Text for body copy, so the site adds one family rather than two, and
 * the pairing is deliberate: a slightly tighter, geometric face for headlines
 * against a neutral face for reading. Both are self-hosted by next/font, so
 * there is no third-party request in the critical path and no layout shift.
 */
const display = Manrope({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-display',
  display: 'swap',
})

const DESCRIPTION =
  'MyCampusView runs student records, attendance, fees, examinations, communication and transport on one database, so information entered once is correct everywhere.'

export const metadata: Metadata = {
  metadataBase: new URL(env().APP_URL),
  title: {
    default: 'MyCampusView — one system to run your school',
    template: '%s · MyCampusView',
  },
  description: DESCRIPTION,
  openGraph: {
    type: 'website',
    siteName: 'MyCampusView',
    title: 'MyCampusView — one system to run your school',
    description: DESCRIPTION,
  },
  robots: { index: true, follow: true },
}

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`site ${display.variable}`}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-[var(--ink)] focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>
      <Reveal />
      <SmoothScroll />
      <SiteNav />
      <main id="main">{children}</main>
      <SiteFooter />
    </div>
  )
}
