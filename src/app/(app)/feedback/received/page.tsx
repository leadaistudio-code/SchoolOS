import { redirect } from 'next/navigation'
import { requireContext } from '@/server/context'
import { isPortalOnlyRole } from '@/server/scope'
import { listReceivedTeacherFeedback } from '@/server/modules/students/performance'
import { formatDay } from '@/lib/dates'
import { ROLE } from '@/lib/rbac/roles'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'

export const metadata = { title: 'Teacher feedback' }

export default async function ReceivedTeacherFeedbackPage() {
  const ctx = await requireContext('feedback.view')
  if (!isPortalOnlyRole(ctx.user.roleKeys)) {
    redirect('/feedback')
  }

  const rows = await listReceivedTeacherFeedback(ctx)
  const isParent = ctx.user.roleKeys.includes(ROLE.PARENT)

  return (
    <div className="space-y-4">
      <PageHeader
        title="From teachers"
        description={
          isParent
            ? 'Notes teachers have shared with you about your children. You can view them here; replies are not required.'
            : 'Notes your teachers have shared with you. You can view them here; replies are not required.'
        }
      />

      {rows.length === 0 ? (
        <Card variant="elevated">
          <EmptyState
            title="No teacher feedback yet"
            description={
              isParent
                ? 'When a teacher shares feedback about your child, it will appear in this list.'
                : 'When a teacher shares feedback with you, it will appear in this list.'
            }
          />
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Past feedback</CardTitle>
            <span className="text-xs text-ink-subtle">{rows.length} notes</span>
          </CardHeader>
          <CardContent className="py-1">
            <ul className="divide-y divide-[var(--border)]">
              {rows.map((f) => {
                const chips = [
                  { label: 'Performance', value: f.performance },
                  { label: 'Participation', value: f.participation },
                  { label: 'Homework', value: f.homework },
                  { label: 'Behaviour', value: f.behaviour },
                ].filter((c) => c.value)
                return (
                  <li key={f.id} className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-ink">{f.teacherName}</p>
                        {isParent ? (
                          <p className="text-xs text-ink-subtle">
                            {f.studentName}
                            {f.admissionNo ? ` · ${f.admissionNo}` : ''}
                          </p>
                        ) : null}
                        {f.subjectName ? (
                          <p className="text-xs text-ink-subtle">{f.subjectName}</p>
                        ) : null}
                      </div>
                      <span className="shrink-0 text-xs text-ink-subtle">
                        {formatDay(f.createdAt)}
                      </span>
                    </div>
                    {chips.length ? (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {chips.map((c) => (
                          <Badge key={c.label} tone="neutral">
                            {c.label}: {c.value}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                    {f.strengths ? (
                      <p className="mt-1.5 text-sm text-ink">
                        <span className="text-ink-subtle">Strengths: </span>
                        {f.strengths}
                      </p>
                    ) : null}
                    {f.improvement ? (
                      <p className="mt-1 text-sm text-ink">
                        <span className="text-ink-subtle">To work on: </span>
                        {f.improvement}
                      </p>
                    ) : null}
                    {f.comment ? (
                      <p className="mt-1 whitespace-pre-wrap text-sm text-ink-muted">{f.comment}</p>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
