import Link from 'next/link'
import { GraduationCap } from 'lucide-react'
import { ToastProvider } from '@/components/ui/toast'
import { buttonVariants } from '@/components/ui/button-variants'
import { requireAcademyHost, academyVisitor, ACADEMY_NAME } from '@/server/modules/lms/academy'

export const metadata = {
  title: { default: ACADEMY_NAME, template: `%s · ${ACADEMY_NAME}` },
  description: 'Robotics, AI and coding courses: learn at your own pace, join live online classes and earn a certificate.',
}

/** Public shell for the Academy: its catalogue, course pages and sign-up. */
export default async function AcademyLayout({ children }: { children: React.ReactNode }) {
  const tenant = await requireAcademyHost()
  const visitor = await academyVisitor(tenant)
  const name = tenant.school?.name ?? ACADEMY_NAME
  const logo = tenant.school?.logoUrl

  return (
    <ToastProvider>
      <div className="min-h-dvh bg-bg flex flex-col">
        <header className="bg-surface border-b border-line sticky top-0 z-30">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">
            <Link href="/academy" className="flex items-center gap-2.5 min-w-0">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt="" className="size-9 rounded object-contain" />
              ) : (
                <span className="size-9 rounded-[var(--radius-sm)] bg-[var(--brand-500)] text-[var(--brand-contrast)] grid place-items-center">
                  <GraduationCap className="size-5" aria-hidden />
                </span>
              )}
              <span className="font-semibold text-ink truncate">{name}</span>
            </Link>
            <nav className="ml-auto flex items-center gap-2">
              <Link href="/academy" className={buttonVariants({ variant: 'ghost' })}>
                Courses
              </Link>
              {visitor ? (
                <Link href="/my/learning" className={buttonVariants()}>
                  My learning
                </Link>
              ) : (
                <>
                  <Link href="/login?next=/my/learning" className={buttonVariants({ variant: 'ghost' })}>
                    Sign in
                  </Link>
                  <Link href="/academy/join" className={buttonVariants()}>
                    Join free
                  </Link>
                </>
              )}
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-line bg-surface">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 text-sm text-ink-muted flex flex-wrap gap-x-6 gap-y-2">
            <span>© {new Date().getFullYear()} {name}</span>
            <span>Payments are processed securely by Razorpay.</span>
            <Link href="/academy/terms" className="hover:text-ink">Terms and refunds</Link>
          </div>
        </footer>
      </div>
    </ToastProvider>
  )
}
