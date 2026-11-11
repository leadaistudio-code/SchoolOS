import Link from 'next/link'
import { Award } from 'lucide-react'
import { requireLms } from '@/server/modules/lms/access'
import { myCertificates } from '@/server/modules/lms/certificates'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { formatIst } from '@/lib/ist-clock'
import { lmsCategory } from '@/lib/lms/options'

export const metadata = { title: 'My certificates' }

export default async function MyCertificatesPage() {
  const ctx = await requireLms('lms.learn')
  const rows = await myCertificates(ctx)

  return (
    <div className="space-y-4">
      <PageHeader
        title="My certificates"
        description="You earn one for every course you finish. Print it, or share the QR code so anyone can check it is real."
        breadcrumbs={[{ label: 'My courses', href: '/my/learning' }, { label: 'Certificates' }]}
      />
      {rows.length === 0 ? (
        <Card>
          <EmptyState title="No certificates yet" description="Finish every lesson in a course and your certificate appears here." />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((c) => {
            const category = lmsCategory(c.courseCategory)
            return (
              <Link key={c.id} href={`/my/learning/certificates/${c.id}`} className="lift block rounded-[var(--radius)]">
                <Card className="h-full">
                  <CardContent className="flex h-full gap-3">
                    <span
                      className="grid size-11 shrink-0 place-items-center rounded-full"
                      style={{ background: `${category.colour}1a`, color: category.colour }}
                    >
                      <Award className="size-5" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-ink">{c.courseTitle}</p>
                      <p className="text-sm text-ink-muted">
                        {formatIst(c.issuedAt, 'd MMM yyyy')}
                        {c.scorePercent != null ? ` · Score ${c.scorePercent}%` : ''}
                      </p>
                      <p className="mt-1 font-mono text-xs text-ink-subtle">{c.number}</p>
                      {c.revokedAt ? (
                        <Badge tone="danger" className="mt-2">
                          Revoked by the school
                        </Badge>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
