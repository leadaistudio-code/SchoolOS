import Link from 'next/link'
import { getSessionUser } from '@/server/auth/session'
import { resolveTenant } from '@/server/tenant'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'

export const metadata = { title: 'Account suspended' }

export default async function SuspendedPage() {
  const [user, tenant] = await Promise.all([getSessionUser(), resolveTenant()])
  if (!user || !tenant || user.tenantId !== tenant.id) redirect('/login')
  if (tenant.status !== 'SUSPENDED' || user.impersonatedById) redirect('/')

  return (
    <div className="min-h-dvh grid place-items-center p-6 bg-bg">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-2xl font-semibold text-ink">Account suspended</h1>
        <p className="text-ink-muted">
          Access to {tenant.school?.name ?? tenant.name} has been suspended. You can still{' '}
          <Link href="/help/tickets" className="text-[var(--brand-600)] hover:underline">
            raise a support ticket
          </Link>{' '}
          or contact your platform administrator.
        </p>
        <form action="/api/v1/auth/logout" method="post">
          <Button type="submit" variant="secondary">
            Sign out
          </Button>
        </form>
        <p className="text-xs text-ink-subtle">
          Platform operators can reach the{' '}
          <Link href="/platform" className="text-[var(--brand-600)] hover:underline">
            control console
          </Link>{' '}
          from the root domain.
        </p>
      </div>
    </div>
  )
}
