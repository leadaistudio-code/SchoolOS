import Image from 'next/image'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { academyVisitor, requireAcademyHost } from '@/server/modules/lms/academy'
import { sanitizeLoginNext } from '@/server/auth/login-redirect'
import { ACADEMY_ART } from '@/components/academy/art'
import { JoinForm } from './join-form'

export const metadata = { title: 'Create your account' }

export default async function AcademyJoinPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const tenant = await requireAcademyHost()
  const { next } = await searchParams
  const target = sanitizeLoginNext(next) ?? '/academy'
  if (await academyVisitor(tenant)) redirect(target)

  return (
    <section className="bg-white px-[var(--gutter)] py-14 sm:py-20">
      <div className="mx-auto grid max-w-[72rem] gap-14 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)] lg:gap-20">
        <div className="reveal">
          <h1 className="ed-display text-[clamp(2.4rem,5vw,4rem)]">
            One account.
            <span className="ed-soft block">Every course you take.</span>
          </h1>
          <p className="mt-6 max-w-[40ch] text-[17px] leading-[1.6] text-[var(--text-muted)]">
            Joining is free. You pay only for the courses you choose, and everything you finish stays in the
            same place, certificates included.
          </p>
          <Image
            src={ACADEMY_ART.kit.src}
            alt={ACADEMY_ART.kit.alt}
            width={1024}
            height={768}
            priority
            sizes="(min-width: 1024px) 440px, 100vw"
            className="mt-10 hidden aspect-[4/3] w-full max-w-[28rem] rounded-xl border border-[var(--rule)] bg-[var(--page)] object-cover lg:block"
          />
        </div>

        <div className="reveal">
          <div className="rounded-2xl border border-[var(--rule)] bg-white p-6 sm:p-8">
            <JoinForm next={target} />
          </div>
          <p className="mt-5 text-[15px] text-[var(--text-muted)]">
            Already have an account?{' '}
            <Link
              href={`/login?next=${encodeURIComponent(target)}`}
              className="font-medium text-[var(--ed-ink)] underline underline-offset-4"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </section>
  )
}
