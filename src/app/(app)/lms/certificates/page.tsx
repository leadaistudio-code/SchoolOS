import Link from 'next/link'
import { requireLms } from '@/server/modules/lms/access'
import { listCertificates } from '@/server/modules/lms/certificates'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SearchInput } from '@/components/ui/input'
import { LinkTabs } from '@/components/ui/tabs'
import { EmptyState } from '@/components/ui/states'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { formatIst } from '@/lib/ist-clock'

export const metadata = { title: 'Certificates · Robotics & AI' }

export default async function CertificatesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const ctx = await requireLms('lms.view')
  const { q = '', status: raw } = await searchParams
  const status = raw === 'revoked' ? 'revoked' : raw === 'all' ? undefined : 'valid'
  const rows = await listCertificates(ctx, { q, status })
  const href = (s: string) => `/lms/certificates?status=${s}${q ? `&q=${encodeURIComponent(q)}` : ''}`

  return (
    <div className="space-y-4">
      <PageHeader
        title="Course certificates"
        description="Issued automatically when a student finishes a course. Each one carries a QR code anyone can scan to check it."
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <LinkTabs
          label="Certificate status"
          items={[
            { label: 'Valid', href: href('valid'), active: status === 'valid' },
            { label: 'Revoked', href: href('revoked'), active: status === 'revoked' },
            { label: 'All', href: href('all'), active: !status },
          ]}
        />
        <form className="flex items-center gap-2" action="/lms/certificates">
          {raw ? <input type="hidden" name="status" value={raw} /> : null}
          <SearchInput name="q" defaultValue={q} placeholder="Student, course or number" aria-label="Search certificates" className="w-64" />
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>
      </div>
      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState
            title={q ? 'No certificates match' : 'No certificates yet'}
            description={q ? undefined : 'They appear here the moment a student completes a course.'}
          />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Student</TH>
                  <TH>Course</TH>
                  <TH>Number</TH>
                  <TH>Issued</TH>
                  <TH align="right">Score</TH>
                </tr>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={r.id}>
                    <TD>
                      <Link href={`/lms/certificates/${r.id}`} className="font-medium text-ink hover:text-[var(--brand-600)]">
                        {r.studentName}
                      </Link>
                      <span className="block text-xs text-ink-subtle">{r.className || r.admissionNo}</span>
                    </TD>
                    <TD>{r.courseTitle}</TD>
                    <TD className="whitespace-nowrap font-mono text-xs">
                      {r.number}
                      {r.revokedAt ? (
                        <Badge tone="danger" className="ml-2">
                          Revoked
                        </Badge>
                      ) : null}
                    </TD>
                    <TD className="whitespace-nowrap">{formatIst(r.issuedAt, 'd MMM yyyy')}</TD>
                    <TD align="right">{r.scorePercent != null ? `${r.scorePercent}%` : '—'}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Card>
    </div>
  )
}
