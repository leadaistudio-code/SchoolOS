import Link from 'next/link'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { buttonVariants } from '@/components/ui/button-variants'
import { sessionHistory } from '@/server/modules/tapasya/sessions'
import { RESTRICTION_LABEL } from '@/lib/tapasya/device'
import { formatWhen } from '../_components/format'
import { StudentTabs } from '../_components/student-tabs'
import { requireStudentPage } from '../_components/student-page'

export const metadata = { title: 'Session history · Tapasya' }

const STATE_TONE = { COMPLETED: 'success', CANCELLED: 'neutral', INTERRUPTED: 'warning', EXPIRED: 'neutral' } as const
const PAGE_SIZE = 20

export default async function TapasyaHistoryPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { ctx, student } = await requireStudentPage()
  const page = Math.max(1, Number((await searchParams).page) || 1)
  const { items, total } = await sessionHistory(ctx, student.id, page, PAGE_SIZE)
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div>
      <PageHeader title="Session history" description={`${total} session${total === 1 ? '' : 's'}`} />
      <StudentTabs active="/tapasya/history" />
      {items.length === 0 ? (
        <Card><EmptyState title="No sessions yet" description="Your focus sessions will be listed here with the XP each one earned." /></Card>
      ) : (
        <TableWrap>
          <Table>
            <THead>
              <TR><TH>Started</TH><TH>Task</TH><TH>Settings</TH><TH>Cycles</TH><TH>Focus</TH><TH>Outcome</TH><TH>Restriction</TH><TH>XP</TH></TR>
            </THead>
            <TBody>
              {items.map((s) => (
                <TR key={s.id}>
                  <TD className="tnum whitespace-nowrap">{formatWhen(s.startedAt)}</TD>
                  <TD>{s.task?.title ?? <span className="text-ink-subtle">—</span>}</TD>
                  <TD className="tnum">{s.settings.focusMinutes}/{s.settings.shortBreakMinutes}{s.policySource === 'TEACHER' ? <Badge tone="info" className="ml-1">teacher</Badge> : null}</TD>
                  <TD className="tnum">{s.completedCycles}/{s.plannedCycles}</TD>
                  <TD className="tnum">{s.focusMinutes} min</TD>
                  <TD>
                    <Badge tone={STATE_TONE[s.state as keyof typeof STATE_TONE] ?? 'brand'}>{s.state === 'INTERRUPTED' ? 'Ended early' : s.state.charAt(0) + s.state.slice(1).toLowerCase().replace('_', ' ')}</Badge>
                    {s.offlineSynced ? <Badge tone="neutral" className="ml-1">offline</Badge> : null}
                  </TD>
                  <TD className="text-sm text-ink-muted">{RESTRICTION_LABEL[s.restrictionLevel]}</TD>
                  <TD className="tnum">
                    <span className="text-ink">+{s.xp.validated}</span>
                    {s.xp.pending ? <span className="ml-1 text-ink-subtle">({s.xp.pending} pending)</span> : null}
                    {s.xp.rejected.length ? <span className="block text-xs text-ink-subtle" title={s.xp.rejected.map((r) => r.reason).join('\n')}>{s.xp.rejected[0]!.reason}</span> : null}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrap>
      )}
      {pages > 1 ? (
        <div className="mt-4 flex items-center gap-2">
          {page > 1 ? <Link className={buttonVariants({ variant: 'secondary', size: 'sm' })} href={`/tapasya/history?page=${page - 1}`}>Newer</Link> : null}
          <span className="text-sm text-ink-muted tnum">Page {page} of {pages}</span>
          {page < pages ? <Link className={buttonVariants({ variant: 'secondary', size: 'sm' })} href={`/tapasya/history?page=${page + 1}`}>Older</Link> : null}
        </div>
      ) : null}
    </div>
  )
}
