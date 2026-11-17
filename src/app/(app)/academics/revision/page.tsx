import Link from 'next/link'
import { Plus } from 'lucide-react'
import { redirect } from 'next/navigation'
import { requireContext } from '@/server/context'
import { listPlans } from '@/server/modules/revision/service'
import { formatDay } from '@/lib/dates'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { buttonVariants } from '@/components/ui/button-variants'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'

export const metadata = { title: 'Revision schedule' }

const VIEW_PERMS = ['exams.view', 'calendar.view', 'academics.view'] as const

export default async function RevisionPlansPage() {
  const ctx = await requireContext()
  if (!ctx.canAny(...VIEW_PERMS) && !ctx.can('exams.manage')) redirect('/403')

  const canManage = ctx.can('exams.manage')
  const plans = await listPlans(ctx)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Revision schedule"
        description="Exam-prep revision timetables by class. Published plans are visible to teachers and students."
        actions={
          canManage ? (
            <Link href="/academics/revision/new" className={buttonVariants({ size: 'sm' })}>
              <Plus aria-hidden />
              New plan
            </Link>
          ) : null
        }
      />

      <Card>
        {plans.length === 0 ? (
          <EmptyState
            title="No revision plans yet"
            description={
              canManage
                ? 'Create a plan, add daily slots, then publish when it is ready.'
                : 'Published revision schedules will appear here.'
            }
            action={
              canManage ? (
                <Link href="/academics/revision/new" className={buttonVariants({ size: 'sm' })}>
                  Create a plan
                </Link>
              ) : undefined
            }
          />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <TR>
                  <TH>Plan</TH>
                  <TH>Class</TH>
                  <TH>Date range</TH>
                  <TH>Slots</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {plans.map((p) => (
                  <TR key={p.id}>
                    <TD>
                      <Link
                        href={`/academics/revision/${p.id}`}
                        className="text-sm font-medium text-ink hover:underline"
                      >
                        {p.name}
                      </Link>
                      {p.notes ? <p className="text-xs text-ink-subtle line-clamp-1">{p.notes}</p> : null}
                    </TD>
                    <TD className="text-sm">{p.className}</TD>
                    <TD className="text-sm tnum whitespace-nowrap">
                      {formatDay(p.startsOn, 'd MMM yyyy')} – {formatDay(p.endsOn, 'd MMM yyyy')}
                    </TD>
                    <TD className="text-sm tnum">{p.slotCount}</TD>
                    <TD>
                      {p.publishedAt ? (
                        <Badge tone="success">Published</Badge>
                      ) : (
                        <Badge tone="neutral">Draft</Badge>
                      )}
                    </TD>
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