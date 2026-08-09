import Link from 'next/link'
import { format } from 'date-fns'
import { requireContext } from '@/server/context'
import { getParent } from '@/server/modules/people/service'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { initials } from '@/lib/utils'

export const metadata = { title: 'Parent profile' }

export default async function ParentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireContext('parents.view')
  const parent = await getParent(ctx, id)

  return (
    <div className="space-y-4">
      <PageHeader
        title={`${parent.firstName} ${parent.lastName}`}
        description={
          parent.children.length === 1
            ? '1 child at this school'
            : `${parent.children.length} children at this school`
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardContent className="pt-5">
            <div className="flex items-center gap-3.5">
              <span className="size-16 rounded-full bg-[var(--brand-500)] text-[var(--brand-contrast)] grid place-items-center text-xl font-semibold shrink-0">
                {initials(parent.firstName, parent.lastName)}
              </span>
              <div className="min-w-0">
                <p className="text-[16px] font-semibold text-ink truncate">
                  {parent.firstName} {parent.lastName}
                </p>
                <Badge tone={parent.user ? 'success' : 'neutral'} className="mt-1">
                  {parent.user ? 'portal access' : 'no login'}
                </Badge>
              </div>
            </div>

            <dl className="mt-5 space-y-2.5 text-[13px]">
              <Row label="Phone" value={parent.phone ?? '—'} />
              <Row label="Email" value={parent.email ?? '—'} />
              <Row label="Occupation" value={parent.occupation ?? '—'} />
              <Row
                label="Address"
                value={
                  [parent.addressLine1, parent.city, parent.state, parent.postalCode]
                    .filter(Boolean)
                    .join(', ') || '—'
                }
              />
              <Row
                label="Last sign-in"
                value={
                  parent.user?.lastLoginAt
                    ? format(parent.user.lastLoginAt, 'd MMM yyyy, HH:mm')
                    : 'Never'
                }
              />
            </dl>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Children</CardTitle>
              <p className="text-[13px] text-ink-muted mt-0.5">
                This parent signs in once and switches between these students.
              </p>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {parent.children.length === 0 ? (
              <EmptyState
                title="No children linked"
                description="Link a student so this parent can see attendance, homework and fees."
              />
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {parent.children.map((link) => {
                  const enrollment = link.student.enrollments[0]
                  return (
                    <li key={link.id} className="flex items-center justify-between gap-3 py-2.5">
                      <Link
                        href={`/students/${link.student.id}`}
                        className="flex items-center gap-2.5 group min-w-0"
                      >
                        <span className="size-8 rounded-full bg-surface-2 border border-line grid place-items-center text-[11px] font-semibold text-ink-muted shrink-0">
                          {initials(link.student.firstName, link.student.lastName)}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[13.5px] text-ink group-hover:text-[var(--brand-600)] truncate">
                            {link.student.firstName} {link.student.lastName}
                          </span>
                          <span className="block text-[12px] text-ink-subtle">
                            {link.student.admissionNo}
                            {enrollment
                              ? ` · ${enrollment.classLevel.name} ${enrollment.section.name}`
                              : ''}
                            {enrollment?.rollNumber ? ` · Roll ${enrollment.rollNumber}` : ''}
                          </span>
                        </span>
                      </Link>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge tone="neutral">{link.relation.toLowerCase()}</Badge>
                        {link.isPrimary ? <Badge tone="brand">primary</Badge> : null}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-subtle shrink-0">{label}</dt>
      <dd className="text-ink text-right break-words">{value}</dd>
    </div>
  )
}
