import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Container } from '@/components/site/container'
import { SchoolFinder } from '@/components/site/school-finder'
import { env } from '@/lib/env'

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Each school signs in at its own MyCampusView address.',
  alternates: { canonical: '/sign-in' },
  robots: { index: false, follow: true },
}

/**
 * Sign in.
 *
 * There is nothing to sign into here: every school has its own address, and a
 * single shared login page would have to ask which school you belong to before
 * it could do anything. So the page does exactly that, and sends you there.
 *
 * Unless `APP_SIGN_IN_URL` is set, in which case there is one known place to
 * send everybody and asking would be theatre. That is the case on a deployment
 * whose root domain has no wildcard — a `*.up.railway.app` hostname — where
 * the finder can only ever build an address that does not resolve.
 */
export const dynamic = 'force-dynamic'

export default function SignInPage() {
  const direct = env().APP_SIGN_IN_URL
  if (direct) redirect(direct)

  return (
    <div className="bg-[var(--page)] py-24">
      <Container>
        <div className="mx-auto max-w-lg">
          <p className="eyebrow">Sign in</p>
          <h1 className="display mt-3 text-[clamp(2rem,4vw,2.75rem)]">
            Your school has its own address.
          </h1>
          <p className="muted mt-4 text-[17px] leading-[1.6]">
            MyCampusView gives each school its own space. Enter the short name your school uses and we
            will take you to its sign-in page.
          </p>
          <div className="mt-8">
            <SchoolFinder />
          </div>
          <p className="subtle mt-6 text-[15px]">
            Not sure what it is? It is in the link your school sent you, before the first dot. Your
            school administrator can confirm it.
          </p>
        </div>
      </Container>
    </div>
  )
}
