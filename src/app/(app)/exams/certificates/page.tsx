import Link from 'next/link'
import { format } from 'date-fns'
import { requireContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import {
  certificateIssueSetup,
  listCertificates,
  listCertificateTemplates,
} from '@/server/modules/certificates/service'
import { IssueCertificateForm } from './issue-form'
import { CertificateTemplateForm } from './template-form'

export const metadata = { title: 'Certificates' }

export default async function CertificatesPage() {
  const ctx = await requireContext('certificates.view')

  const [certificates, templates, setup] = await Promise.all([
    listCertificates(ctx),
    listCertificateTemplates(ctx),
    ctx.can('certificates.issue') ? certificateIssueSetup(ctx) : null,
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Certificates"
        description="Issue bonafide, transfer and character certificates with QR verification."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Issue register</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {certificates.length === 0 ? (
              <EmptyState
                title="No certificates issued yet"
                description="Issue a certificate against a student record. Each carries a unique verification code."
              />
            ) : (
              <TableWrap>
                <Table>
                  <THead>
                    <tr>
                      <TH>Number</TH>
                      <TH>Student</TH>
                      <TH>Type</TH>
                      <TH>Issued</TH>
                      <TH>Status</TH>
                      <TH align="right"> </TH>
                    </tr>
                  </THead>
                  <TBody>
                    {certificates.map((certificate) => (
                      <TR key={certificate.id}>
                        <TD className="text-sm font-mono">{certificate.number}</TD>
                        <TD className="text-sm">
                          {certificate.student.firstName} {certificate.student.lastName}
                          <p className="text-xs text-ink-subtle">{certificate.student.admissionNo}</p>
                        </TD>
                        <TD className="text-sm">{certificate.template.name}</TD>
                        <TD className="text-sm text-ink-muted">
                          {format(certificate.issuedOn, 'd MMM yyyy')}
                        </TD>
                        <TD>
                          <Badge tone={certificate.revokedAt ? 'danger' : 'success'}>
                            {certificate.revokedAt ? 'Revoked' : 'Valid'}
                          </Badge>
                        </TD>
                        <TD align="right">
                          <Link
                            href={`/exams/certificates/${certificate.id}`}
                            className="text-sm text-[var(--brand-600)] hover:underline"
                          >
                            Open
                          </Link>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableWrap>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          {setup ? (
            <Card>
              <CardHeader>
                <CardTitle>Issue certificate</CardTitle>
              </CardHeader>
              <CardContent>
                <IssueCertificateForm templates={setup.templates} students={setup.students} />
              </CardContent>
            </Card>
          ) : null}

          {ctx.can('certificates.template') ? (
            <Card>
              <CardHeader>
                <CardTitle>New template</CardTitle>
              </CardHeader>
              <CardContent>
                <CertificateTemplateForm />
                <p className="mt-4 text-xs text-ink-subtle">
                  {templates.length} template{templates.length === 1 ? '' : 's'} on file, including
                  built-in bonafide, transfer and character layouts.
                </p>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  )
}
