import { ShieldCheck, ShieldX } from 'lucide-react'
import { verifyLmsCertificate } from '@/server/modules/lms/certificates'
import { formatIst } from '@/lib/ist-clock'
import { lmsCategory, lmsLevelLabel } from '@/lib/lms/options'
import { env } from '@/lib/env'

export const metadata = { title: 'Verify course certificate', robots: { index: false } }

export default async function VerifyCourseCertificatePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const result = await verifyLmsCertificate(token)
  const c = result?.certificate

  return (
    <div className="min-h-dvh bg-bg flex flex-col justify-center px-6 py-12">
      <div className="w-full max-w-lg mx-auto">
        <p className="text-sm font-medium text-ink-muted">{env().APP_NAME}</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">Course certificate check</h1>

        {!c ? (
          <div role="alert" className="mt-8 rounded-[var(--radius)] border border-line bg-surface p-6 flex gap-3">
            <ShieldX className="size-5 text-[var(--danger)] shrink-0" aria-hidden />
            <div>
              <p className="font-medium text-ink">Certificate not found</p>
              <p className="mt-1 text-sm text-ink-muted">
                This code does not match any certificate on record. It may be mistyped or made up.
              </p>
            </div>
          </div>
        ) : (
          <div className="mt-8 rounded-[var(--radius)] border border-line bg-surface p-6 space-y-4">
            <div className="flex gap-3">
              {c.revokedAt ? (
                <ShieldX className="size-5 text-[var(--danger)] shrink-0" aria-hidden />
              ) : (
                <ShieldCheck className="size-5 text-[var(--success)] shrink-0" aria-hidden />
              )}
              <div>
                <p className="font-medium text-ink">{c.revokedAt ? 'This certificate was revoked' : 'This certificate is genuine'}</p>
                <p className="mt-1 text-sm text-ink-muted">Issued by {result.school.name}</p>
              </div>
            </div>

            <dl className="grid gap-3 text-sm border-t border-line pt-4">
              <div>
                <dt className="text-ink-subtle">Awarded to</dt>
                <dd className="font-medium text-ink">{c.studentName}</dd>
              </div>
              <div>
                <dt className="text-ink-subtle">Course</dt>
                <dd className="text-ink">{c.courseTitle}</dd>
                <dd className="text-ink-muted">
                  {lmsCategory(c.courseCategory).label} · {lmsLevelLabel(c.courseLevel)} · {c.lessons} lessons
                  {c.scorePercent != null ? ` · Score ${c.scorePercent}%` : ''}
                </dd>
              </div>
              <div>
                <dt className="text-ink-subtle">Number</dt>
                <dd className="font-mono text-ink">{c.number}</dd>
              </div>
              <div>
                <dt className="text-ink-subtle">Issued on</dt>
                <dd className="text-ink">{formatIst(c.issuedAt, 'd MMMM yyyy')}</dd>
              </div>
              {c.revokedAt ? (
                <div>
                  <dt className="text-ink-subtle">Revoked on</dt>
                  <dd className="text-ink">{formatIst(c.revokedAt, 'd MMMM yyyy')}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        )}
      </div>
    </div>
  )
}
