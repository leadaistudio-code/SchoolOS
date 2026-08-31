import Link from 'next/link'
import { format } from 'date-fns'
import { ChevronLeft } from 'lucide-react'
import { requireContext } from '@/server/context'
import {
  certificateVerifyUrl,
  getCertificate,
  renderCertificateBody,
} from '@/server/modules/certificates/service'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DocumentLetterhead } from '@/components/print/document-letterhead'
import { revokeCertificateAction } from '../actions'
import { PrintCertificateButton } from '../print-button'

export const metadata = { title: 'Certificate' }

export default async function CertificateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext('certificates.view')
  const { id } = await params
  const certificate = await getCertificate(ctx, id)
  const data = certificate.data as { variables?: Record<string, string>; renderedBody?: string } | null
  const body =
    data?.renderedBody ??
    renderCertificateBody(certificate.template.bodyHtml, data?.variables ?? {})
  const verifyUrl = certificateVerifyUrl(certificate.verifyToken)
  const qrUrl = `/api/v1/verify/certificate/${certificate.verifyToken}/qr`
  const school = ctx.tenant.school

  return (
    <div className="max-w-3xl">
      <div className="no-print mb-4 flex items-center justify-between gap-3">
        <Link
          href="/exams/certificates"
          className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"
        >
          <ChevronLeft className="size-4" aria-hidden />
          All certificates
        </Link>
        <div className="flex items-center gap-2">
          <PrintCertificateButton />
          {ctx.can('certificates.issue') && !certificate.revokedAt ? (
            <form action={revokeCertificateAction.bind(null, id)}>
              <Button type="submit" variant="secondary" size="sm">
                Revoke
              </Button>
            </form>
          ) : null}
        </div>
      </div>

      <DocumentLetterhead
        schoolName={school?.name ?? ctx.tenant.name}
        logoUrl={school?.logoUrl}
        letterheadHeaderUrl={school?.letterheadHeaderUrl}
        letterheadFooterUrl={school?.letterheadFooterUrl}
        footerText={school?.footerText}
        signatureUrl={school?.signatureUrl}
      >
        <header className="border-b border-line pb-4 text-center">
          <p className="caption">{certificate.template.name}</p>
          <p className="mt-1 text-sm text-ink-muted font-mono">{certificate.number}</p>
          {certificate.revokedAt ? (
            <p className="mt-2">
              <Badge tone="danger">Revoked {format(certificate.revokedAt, 'd MMM yyyy')}</Badge>
            </p>
          ) : null}
        </header>

        <div
          className="prose prose-sm max-w-none py-6 text-ink certificate-body"
          dangerouslySetInnerHTML={{ __html: body }}
        />

        <div className="border-t border-line pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-xs text-ink-subtle">
            <p>
              Issued to {certificate.student.firstName} {certificate.student.lastName}
            </p>
            <p>Admission no. {certificate.student.admissionNo}</p>
            <p>{format(certificate.issuedOn, 'd MMMM yyyy')}</p>
          </div>
          {!certificate.revokedAt ? (
            <div className="text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrUrl} alt="" width={120} height={120} className="mx-auto" />
              <p className="mt-2 text-[10px] text-ink-subtle break-all max-w-[160px]">{verifyUrl}</p>
            </div>
          ) : null}
        </div>
      </DocumentLetterhead>
    </div>
  )
}
