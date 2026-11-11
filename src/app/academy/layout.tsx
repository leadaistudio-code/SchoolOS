import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import '@/styles/site.css'
import { ToastProvider } from '@/components/ui/toast'
import { Reveal } from '@/components/site/reveal'
import { SmoothScroll } from '@/components/site/motion/provider'
import { MyCampusViewLogo } from '@/components/brand/logo'
import { AcademyHeader } from '@/components/academy/header'
import { env } from '@/lib/env'
import { displayFont } from '@/lib/fonts/display'
import { requireAcademyHost, academyVisitor, ACADEMY_NAME } from '@/server/modules/lms/academy'

export const metadata = {
  title: { default: ACADEMY_NAME, template: `%s · ${ACADEMY_NAME}` },
  description: 'Robotics, AI and coding courses for school students: video lessons, quizzes, reviewed projects, live classes and a certificate you can verify.',
}

/*
 * Application components (buttons, fields, dialogs) render inside the Academy
 * too. They read the tenant's brand colour, so it is restated here as the
 * marketing site's ink: one black action colour across the whole page.
 */
const INK_BRAND = {
  '--brand-50': '#f2f1ec',
  '--brand-100': '#e6e5df',
  '--brand-500': '#0b0b0d',
  '--brand-600': '#000000',
  '--brand-contrast': '#ffffff',
} as React.CSSProperties

/** Public shell for the Academy: its catalogue, course pages and sign-up. */
export default async function AcademyLayout({ children }: { children: React.ReactNode }) {
  const tenant = await requireAcademyHost()
  const visitor = await academyVisitor(tenant)
  const name = tenant.school?.name ?? ACADEMY_NAME
  const marketing = `${new URL(env().APP_URL).protocol}//${env().APP_ROOT_DOMAIN}`

  return (
    <ToastProvider>
      {/* The marketing site's display face, so the Academy reads as the same brand. */}
      <div className={`site ${displayFont.variable} flex min-h-dvh flex-col`} style={INK_BRAND}>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-[var(--ink)] focus:px-4 focus:py-2 focus:text-white"
        >
          Skip to content
        </a>
        <Reveal />
        <SmoothScroll />
        <AcademyHeader signedIn={!!visitor} firstName={visitor?.firstName} />
        <main id="main" className="flex-1">
          {children}
        </main>

        <footer className="border-t border-[var(--rule)] bg-white">
          <div className="mx-auto grid max-w-[78rem] gap-12 px-[var(--gutter)] py-16 md:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)_minmax(0,1fr)]">
            <div>
              <div className="flex items-center gap-2.5">
                <MyCampusViewLogo size="sm" />
                <span aria-hidden className="h-4 w-px bg-[var(--rule-strong)]" />
                <span className="text-[15px] font-semibold text-[var(--ed-ink)]">Academy</span>
              </div>
              <p className="mt-5 max-w-[34ch] text-[15px] leading-[1.6] text-[var(--text-muted)]">
                Robotics, AI and coding, taught the way you would learn it in a good school lab: by building
                the thing.
              </p>
            </div>
            <nav aria-label="Academy" className="flex flex-col gap-3 text-[15px]">
              <Link href="/academy#courses" className="w-fit text-[var(--text-muted)] hover:text-[var(--ed-ink)]">Courses</Link>
              {visitor ? (
                <Link href="/my/learning" className="w-fit text-[var(--text-muted)] hover:text-[var(--ed-ink)]">My learning</Link>
              ) : (
                <>
                  <Link href="/academy/join" className="w-fit text-[var(--text-muted)] hover:text-[var(--ed-ink)]">Create an account</Link>
                  <Link href="/login?next=/my/learning" className="w-fit text-[var(--text-muted)] hover:text-[var(--ed-ink)]">Sign in</Link>
                </>
              )}
              <Link href="/academy/terms" className="w-fit text-[var(--text-muted)] hover:text-[var(--ed-ink)]">Terms and refunds</Link>
            </nav>
            <div>
              <h2 className="text-[15px] font-semibold">Running a school?</h2>
              <p className="mt-2 max-w-[36ch] text-[15px] leading-[1.6] text-[var(--text-muted)]">
                The same courses run inside MyCampusView for your own classes, with kits issued from your lab.
              </p>
              <a href={marketing} className="ed-link mt-4 text-[15px] text-[var(--ed-ink)]">
                mycampusview.com
                <ArrowUpRight className="size-[1em]" aria-hidden />
              </a>
            </div>
          </div>
          <div className="mx-auto flex max-w-[78rem] flex-wrap justify-between gap-x-8 gap-y-2 border-t border-[var(--rule)] px-[var(--gutter)] py-6 text-[13.5px] text-[var(--text-subtle)]">
            <span>© {new Date().getFullYear()} {name}</span>
            <span>Payments are processed securely by Razorpay.</span>
          </div>
        </footer>
      </div>
    </ToastProvider>
  )
}
