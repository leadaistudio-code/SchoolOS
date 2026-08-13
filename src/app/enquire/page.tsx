import { redirect } from 'next/navigation'
import { resolveTenant } from '@/server/tenant'
import { EnquireForm } from './enquire-form'

export const metadata = { title: 'Admission enquiry' }

export default async function EnquirePage() {
  const tenant = await resolveTenant()
  if (!tenant) redirect('/')

  const school = tenant.school
  const title = school?.name ?? tenant.name

  return (
    <div className="min-h-dvh flex flex-col justify-center px-6 sm:px-12 py-10 bg-surface">
      <div className="w-full max-w-md mx-auto">
        <div className="flex items-center gap-2.5 mb-8">
          {school?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={school.logoUrl} alt="" className="size-9 rounded object-contain" />
          ) : (
            <span className="size-9 rounded-[var(--radius-sm)] bg-[var(--brand-500)] text-[var(--brand-contrast)] grid place-items-center font-semibold text-lg">
              {title.charAt(0)}
            </span>
          )}
          <span className="font-semibold text-lg text-ink">{title}</span>
        </div>

        <h1 className="text-2xl font-semibold text-ink">Admission enquiry</h1>
        <p className="text-base text-ink-muted mt-1 mb-6">
          Leave your details and the admissions team will get back to you.
        </p>

        <EnquireForm />
      </div>
    </div>
  )
}
