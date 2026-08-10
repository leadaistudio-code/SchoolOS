import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button-variants'

export default function NotFound() {
  return (
    <div className="min-h-dvh grid place-items-center px-6">
      <div className="text-center max-w-sm">
        <p className="text-sm font-medium text-[var(--brand-600)]">404</p>
        <h1 className="text-2xl font-semibold text-ink mt-1">Page not found</h1>
        <p className="text-base text-ink-muted mt-1.5">
          The page you are looking for does not exist or has been moved.
        </p>
        <Link href="/" className={`${buttonVariants({ variant: 'secondary' })} mt-5`}>
          Back to dashboard
        </Link>
      </div>
    </div>
  )
}
