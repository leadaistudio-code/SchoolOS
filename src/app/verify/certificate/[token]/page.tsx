import { ShieldCheck, ShieldX } from 'lucide-react'
import { verifyCertificate } from '@/server/modules/certificates/service'
import { formatDay } from '@/lib/dates'
import { env } from '@/lib/env'

export const metadata = { title: 'Verify certificate' }

export default async function VerifyCertificatePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const result = await verifyCertificate(token)

  return (
    <div className="min-h-dvh bg-bg flex flex-col justify-center px-6 py-12">
      <div className="w-full max-w-lg mx-auto">
        <p className="text-sm font-medium text-ink-muted">{env().APP_NAME}</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">Certificate verification</h1>

        {!result ? (
          <div
            role="alert"
            className="mt-8 rounded-[var(--radius)] border border-line bg-surface p-6 flex gap-3"
          >
            <ShieldX className="size-5 text-[var(--danger)] shrink-0" aria-hidden />
            <div>
              <p className="font-medium text-ink">Certificate not found</p>
              <p className="mt-1 text-sm text-ink-muted">
                This verification code does not match any certificate on record. It may be invalid
                or mistyped.
              </p>
            </div>
          </div>
        ) : (
          <div className="mt-8 rounded-[var(--radius)] border border-line bg-surface p-6 space-y-4">
            <div className="flex gap-3">
              {result.certificate.revokedAt ? (
                <ShieldX className="size-5 text-[var(--danger)] shrink-0" aria-hidden />
              ) : (
                <ShieldCheck className="size-5 text-[var(--success)] shrink-0" aria-hidden />
              )}
              <div>
                <p className="font-medium text-ink">
                  {result.certificate.revokedAt ? 'Certificate revoked' : 'Certificate is authentic'}
                </p>
                <p className="mt-1 text-sm text-ink-muted">
                  Issued by {result.schoolName}
                </p>
              </div>
            </div>

            <dl className="grid gap-3 text-sm border-t border-line pt-4">
              <div>
                <dt className="text-ink-subtle">Certificate</dt>
                <dd className="font-medium text-ink">{result.certificate.template.name}</dd>
              </div>
              <div>
                <dt className="text-ink-subtle">Number</dt>
                <dd className="font-mono text-ink">{result.certificate.number}</dd>
              </div>
              <div>
                <dt className="text-ink-subtle">Student</dt>
                <dd className="text-ink">
                  {result.certificate.student.firstName} {result.certificate.student.lastName}
                </dd>
              </div>
              <div>
                <dt className="text-ink-subtle">Admission no.</dt>
                <dd className="text-ink">{result.certificate.student.admissionNo}</dd>
              </div>
              <div>
                <dt className="text-ink-subtle">Issued on</dt>
                <dd className="text-ink">{formatDay(result.certificate.issuedOn, 'd MMMM yyyy')}</dd>
              </div>
              {result.certificate.revokedAt ? (
                <div>
                  <dt className="text-ink-subtle">Revoked on</dt>
                  <dd className="text-ink">{formatDay(result.certificate.revokedAt, 'd MMMM yyyy')}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        )}
      </div>
    </div>
  )
}
