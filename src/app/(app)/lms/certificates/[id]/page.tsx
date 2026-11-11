import { requireLms } from '@/server/modules/lms/access'
import { certificateArtwork, getCertificate } from '@/server/modules/lms/certificates'
import { PageHeader } from '@/components/page-header'
import { Notice } from '@/components/ui/states'
import { CourseCertificate } from '@/components/lms/course-certificate'
import { PrintButton } from '@/components/lms/print-button'
import { formatIst } from '@/lib/ist-clock'
import { RevokeCertificateButton } from '../revoke-button'

export const metadata = { title: 'Certificate · Robotics & AI' }

export default async function CertificatePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireLms('lms.view')
  const { id } = await params
  const certificate = await getCertificate(ctx, id)
  const art = await certificateArtwork(ctx.tenant.id, certificate.verifyToken)

  return (
    <div className="space-y-4">
      <div className="no-print">
        <PageHeader
          title={certificate.number}
          description={`${certificate.studentName} · ${certificate.courseTitle}`}
          breadcrumbs={[{ label: 'Certificates', href: '/lms/certificates' }, { label: certificate.number }]}
          actions={
            <>
              {ctx.can('lms.manage') ? <RevokeCertificateButton id={certificate.id} revoked={!!certificate.revokedAt} /> : null}
              <PrintButton />
            </>
          }
        />
      </div>
      {certificate.revokedAt ? (
        <div className="no-print">
          <Notice tone="danger" title={`Revoked on ${formatIst(certificate.revokedAt, 'd MMM yyyy')}${certificate.revokedByLabel ? ` by ${certificate.revokedByLabel}` : ''}`}>
            {certificate.revokedReason}
          </Notice>
        </div>
      ) : null}
      <CourseCertificate data={certificate} school={art.school} qr={art.qr} verifyUrl={art.url} />
    </div>
  )
}
