import Link from 'next/link'
import { ShieldX } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button-variants'

export const metadata = { title: 'Access denied' }

export default function ForbiddenPage() {
  return (
    <div className="min-h-dvh grid place-items-center px-6">
      <div className="text-center max-w-sm">
        <div className="size-12 rounded-full bg-danger-bg text-[var(--danger)] grid place-items-center mx-auto mb-4">
          <ShieldX className="size-6" aria-hidden />
        </div>
        <h1 className="text-[20px] font-semibold text-ink">You do not have access to this page</h1>
        <p className="text-[13.5px] text-ink-muted mt-1.5">
          Your role does not include this permission. If you think this is a mistake, ask your
          school administrator to review your access.
        </p>
        <Link href="/" className={`${buttonVariants({ variant: 'secondary' })} mt-5`}>
          Back to dashboard
        </Link>
      </div>
    </div>
  )
}
