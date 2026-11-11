import Link from 'next/link'
import { redirect } from 'next/navigation'
import { academyVisitor, requireAcademyHost } from '@/server/modules/lms/academy'
import { sanitizeLoginNext } from '@/server/auth/login-redirect'
import { Card, CardContent } from '@/components/ui/card'
import { JoinForm } from './join-form'

export const metadata = { title: 'Create your account' }

export default async function AcademyJoinPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const tenant = await requireAcademyHost()
  const { next } = await searchParams
  const target = sanitizeLoginNext(next) ?? '/academy'
  if (await academyVisitor(tenant)) redirect(target)

  return (
    <div className="max-w-md mx-auto px-4 py-10">
      <h1 className="text-2xl font-semibold text-ink">Create your account</h1>
      <p className="mt-1 text-ink-muted">Free to join. Pay only for the courses you take.</p>
      <Card className="mt-6">
        <CardContent>
          <JoinForm next={target} />
        </CardContent>
      </Card>
      <p className="mt-4 text-sm text-ink-muted">
        Already have an account?{' '}
        <Link href={`/login?next=${encodeURIComponent(target)}`} className="font-medium text-[var(--brand-600)] hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  )
}
