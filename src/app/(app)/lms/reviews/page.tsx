import Link from 'next/link'
import { requireLms } from '@/server/modules/lms/access'
import { reviewQueue, type ReviewFilter } from '@/server/modules/lms/projects'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { LinkTabs } from '@/components/ui/tabs'
import { EmptyState } from '@/components/ui/states'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { formatIst } from '@/lib/ist-clock'

export const metadata = { title: 'Project reviews · Robotics & AI' }

const TABS: { value: ReviewFilter; label: string }[] = [
  { value: 'SUBMITTED', label: 'Waiting for review' },
  { value: 'CHANGES_REQUESTED', label: 'Sent back' },
  { value: 'APPROVED', label: 'Approved' },
]

export default async function ReviewsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const ctx = await requireLms('lms.teach')
  const { status: raw } = await searchParams
  const status = TABS.find((t) => t.value === raw)?.value ?? 'SUBMITTED'
  const { rows, counts } = await reviewQueue(ctx, status)

  return (
    <div className="space-y-4">
      <PageHeader title="Project reviews" description={`${counts.SUBMITTED ?? 0} waiting · approve a project to complete that lesson for the student`} />
      <LinkTabs
        label="Review status"
        items={TABS.map((t) => ({
          label: t.label,
          href: t.value === 'SUBMITTED' ? '/lms/reviews' : `/lms/reviews?status=${t.value}`,
          active: status === t.value,
          count: counts[t.value] ?? 0,
        }))}
      />
      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState
            title={status === 'SUBMITTED' ? 'All caught up' : 'Nothing here'}
            description={status === 'SUBMITTED' ? 'Projects students hand in from their courses appear here.' : undefined}
          />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Student</TH>
                  <TH>Project</TH>
                  <TH>{status === 'SUBMITTED' ? 'Handed in' : 'Reviewed'}</TH>
                  {status === 'APPROVED' ? <TH align="right">Score</TH> : null}
                </tr>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={r.id}>
                    <TD>
                      <Link href={`/lms/reviews/${r.id}`} className="font-medium text-ink hover:text-[var(--brand-600)]">
                        {r.studentName}
                      </Link>
                      <span className="block text-xs text-ink-subtle">{r.className || r.admissionNo}</span>
                    </TD>
                    <TD>
                      <Link href={`/lms/reviews/${r.id}`} className="text-ink hover:text-[var(--brand-600)]">{r.lessonTitle}</Link>
                      <span className="block text-xs text-ink-subtle">
                        {r.courseTitle}
                        {r.version > 1 ? ` · attempt ${r.version}` : ''}
                      </span>
                    </TD>
                    <TD className="whitespace-nowrap">
                      {formatIst(status === 'SUBMITTED' ? r.submittedAt : (r.reviewedAt ?? r.submittedAt), 'd MMM, h:mm a')}
                      {status !== 'SUBMITTED' && r.reviewedByLabel ? <span className="block text-xs text-ink-subtle">{r.reviewedByLabel}</span> : null}
                    </TD>
                    {status === 'APPROVED' ? <TD align="right">{r.score !== null ? `${r.score}%` : '—'}</TD> : null}
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
