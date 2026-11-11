import { notFound } from 'next/navigation'
import { ApiException } from '@/server/api/response'
import { requireLms } from '@/server/modules/lms/access'
import { certificateArtwork, myCertificate } from '@/server/modules/lms/certificates'
import { PageHeader } from '@/components/page-header'
import { Notice } from '@/components/ui/states'
import { CourseCertificate } from '@/components/lms/course-certificate'
import { PrintButton } from '@/components/lms/print-button'

export const metadata = { title: 'Certificate' }

export default async function MyCertificatePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireLms('lms.learn')
  const { id } = await params
  const certificate = await myCertificate(ctx, id).catch((err) => {
    if (err instanceof ApiException && err.status === 404) return null
    throw err
  })
  if (!certificate) notFound()
  const art = await certificateArtwork(ctx.tenant.id, certificate.verifyToken)

  return (
    <div className="space-y-4">
      <div className="no-print">
        <PageHeader
          title={certificate.courseTitle}
          description={certificate.number}
          breadcrumbs={[{ label: 'My courses', href: '/my/learning' }, { label: 'Certificates', href: '/my/learning/certificates' }, { label: certificate.courseTitle }]}
          actions={certificate.revokedAt ? null : <PrintButton />}
        />
      </div>
      {certificate.revokedAt ? (
        <div className="no-print">
          <Notice tone="danger" title="This certificate was revoked by your school">
            Speak to your teacher if you think this is a mistake.
          </Notice>
        </div>
      ) : null}
      <CourseCertificate data={certificate} school={art.school} qr={art.qr} verifyUrl={art.url} />
    </div>
  )
}
