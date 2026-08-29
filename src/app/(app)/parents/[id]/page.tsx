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
import { Button } from '@/components/ui/button'
import { EmptyState, Notice } from '@/components/ui/states'
import { Avatar, PersonCell } from '@/components/ui/identity'
import { issueParentPortalLoginAction } from '../actions'

export const metadata = { title: 'Parent profile' }

export default async function ParentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const { id } = await params
  const query = await searchParams
  const ctx = await requireContext('parents.view')
  const parent = await getParent(ctx, id)
  const canIssueLogin =
    !parent.user &&
    !!parent.phone &&
    parent.children.length > 0 &&
    (ctx.can('users.create') || ctx.can('parents.create') || ctx.can('parents.edit'))

  return (
    <div className="space-y-4">
      <PageHeader
        title={`${parent.firstName} ${parent.lastName}`}
        description={
          parent.children.length === 1
            ? '1 child at this school'
            : `${parent.children.length} children at this school`
        }
        actions={
          canIssueLogin ? (
            <form action={issueParentPortalLoginAction.bind(null, id)}>
              <Button type="submit" size="sm" variant="secondary">
                Issue portal login
              </Button>
            </form>
          ) : null
        }
      />

      {query.welcome ? (
        <Notice tone="success" title="Portal login created">
          Username is their phone. One-time password:{' '}
          <strong className="tnum">{query.welcome}</strong>. Share it with {parent.firstName} now —
          it is not stored and cannot be shown again. They will be asked to change it at first
          sign-in.
        </Notice>
      ) : null}

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
              <DescriptionItem label="Last sign-in">
                  {parent.user?.lastLoginAt
                    ? format(parent.user.lastLoginAt, 'd MMM yyyy, HH:mm')
                    : 'Never'}
                </DescriptionItem>
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
                        avatarUrl={link.student.photoUrl}
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
