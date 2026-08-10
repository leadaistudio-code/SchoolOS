import type { Metadata } from 'next'
import { Instrument_Serif } from 'next/font/google'
import '@/styles/site.css'
import { SiteNav } from '@/components/site/nav'
import { SiteFooter } from '@/components/site/footer'
import { env } from '@/lib/env'

/**
 * One display face, one weight, headlines only.
 *
 * The application already loads Golos Text for everything else, so the public
 * site adds a single file rather than a second family.
 */
const display = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-display',
  display: 'swap',
})

const DESCRIPTION =
  'SchoolOS runs student records, attendance, fees, examinations, communication and transport on one database, so information entered once is correct everywhere.'

export const metadata: Metadata = {
  metadataBase: new URL(env().APP_URL),
  title: {
    default: 'SchoolOS — one system to run your school',
    template: '%s · SchoolOS',
  },
  description: DESCRIPTION,
  openGraph: {
    type: 'website',
    siteName: 'SchoolOS',
    title: 'SchoolOS — one system to run your school',
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
      <SiteNav />
      <main id="main">{children}</main>
      <SiteFooter />
    </div>
  )
}
