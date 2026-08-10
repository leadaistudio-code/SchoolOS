import { format } from 'date-fns'
import { requireContext } from '@/server/context'
import { getParent } from '@/server/modules/people/service'
import { PageHeader } from '@/components/page-header'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DescriptionItem,
  DescriptionList,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { Avatar, PersonCell } from '@/components/ui/identity'

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
          <CardContent>
            <div className="flex items-center gap-3">
              <Avatar firstName={parent.firstName} lastName={parent.lastName} />
              <div className="min-w-0">
                <p className="text-base font-semibold text-ink truncate">
                  {parent.firstName} {parent.lastName}
                </p>
                <Badge tone={parent.user ? 'success' : 'neutral'} className="mt-1">
                  {parent.user ? 'Portal access' : 'No login'}
                </Badge>
              </div>
            </div>

            <DescriptionList className="mt-4">
              <DescriptionItem label="Phone">{parent.phone ?? '—'}</DescriptionItem>
              <DescriptionItem label="Email">{parent.email ?? '—'}</DescriptionItem>
              <DescriptionItem label="Occupation">{parent.occupation ?? '—'}</DescriptionItem>
              <DescriptionItem label="Address">{
                  [parent.addressLine1, parent.city, parent.state, parent.postalCode]
                    .filter(Boolean)
                    .join(', ') || '—'
                }</DescriptionItem>
              <DescriptionItem label="Last sign-in">{
                  parent.user?.lastLoginAt
                    ? format(parent.user.lastLoginAt, 'd MMM yyyy, HH:mm')
                    : 'Never'
                }</DescriptionItem>
            </DescriptionList>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Children</CardTitle>
              <p className="text-sm text-ink-muted mt-0.5">
                This parent signs in once and switches between these students.
              </p>
            </div>
          </CardHeader>
          <CardContent className="py-1">
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
                    <li key={link.id} className="flex items-center justify-between gap-3 py-2">
                      <PersonCell
                        firstName={link.student.firstName}
                        lastName={link.student.lastName}
                        href={`/students/${link.student.id}`}
                        secondary={`${link.student.admissionNo}${
                          enrollment
                            ? ` · ${enrollment.classLevel.name} ${enrollment.section.name}`
                            : ''
                        }${enrollment?.rollNumber ? ` · Roll ${enrollment.rollNumber}` : ''}`}
                      />
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-xs text-ink-subtle first-letter:uppercase">
                          {link.relation.toLowerCase()}
                        </span>
                        {link.isPrimary ? <Badge tone="brand">Primary</Badge> : null}
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

