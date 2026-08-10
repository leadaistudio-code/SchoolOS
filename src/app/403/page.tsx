import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button-variants'

export const metadata = { title: 'Access denied' }

export default function ForbiddenPage() {
  return (
    <div className="min-h-dvh grid place-items-center px-6">
      <div className="text-center max-w-sm">
        <h1 className="text-2xl font-semibold text-ink">Access denied</h1>
        <p className="text-base text-ink-muted mt-1.5">
          Your role does not include this permission. Ask your school administrator to review your
          access.
        </p>
        <Link href="/" className={`${buttonVariants({ variant: 'secondary' })} mt-5`}>
          Back to dashboard
        </Link>
      </div>
    </div>
  )
}
