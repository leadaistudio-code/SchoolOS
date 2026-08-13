import { requireContext } from '@/server/context'
import { listSessions } from '@/server/modules/settings/sessions'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState, Notice } from '@/components/ui/states'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { formatDay } from '@/lib/dates'
import { NewSessionButton, SessionControls } from './controls'

export const metadata = { title: 'Academic sessions' }

/**
 * Academic sessions.
 *
 * One is current at a time and everything dated in the product hangs off it,
 * so this page leads with which one that is rather than with a list. The
 * record counts are shown because switching sessions is the single most
 * consequential setting in the product and the size of what moves with it
 * should be visible before the click, not after.
 */
export default async function SessionsPage() {
  const ctx = await requireContext('academics.view')
  const sessions = await listSessions(ctx)
  const canManage = ctx.can('academics.manage')
  const current = sessions.find((s) => s.isCurrent)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Academic sessions"
        description={
          current
            ? `${current.name} is current · ${formatDay(current.startsOn)} to ${formatDay(current.endsOn)}`
            : 'No session is marked current'
        }
        breadcrumbs={[{ label: 'Settings', href: '/settings' }, { label: 'Academic sessions' }]}
        actions={canManage ? <NewSessionButton hasAny={sessions.length > 0} /> : null}
      />

      {!current && sessions.length > 0 ? (
        <Notice tone="danger" title="No current session">
          Classes, exams and fee structures all resolve through the current session. Make one
          current before anybody tries to use the product.
        </Notice>
      ) : null}

      <Card className="overflow-hidden">
        {sessions.length === 0 ? (
          <EmptyState
            title="No academic sessions"
            description={
              canManage
                ? 'A session is the school year everything else belongs to. Create one before adding classes.'
                : 'An administrator needs to create the school year before the product can be set up.'
            }
            action={canManage ? <NewSessionButton hasAny={false} label="Create the first session" /> : undefined}
          />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Session</TH>
                  <TH>Runs</TH>
                  <TH align="right">Classes</TH>
                  <TH align="right">Enrolments</TH>
                  <TH align="right">Exams</TH>
                  <TH>Status</TH>
                  {canManage ? <TH align="right">&nbsp;</TH> : null}
                </tr>
              </THead>
              <TBody>
                {sessions.map((s) => (
                  <TR key={s.id}>
                    <TD className="text-sm font-medium text-ink">{s.name}</TD>
                    <TD className="text-sm text-ink-muted tnum">
                      {formatDay(s.startsOn)} – {formatDay(s.endsOn)}
                    </TD>
                    <TD align="right" className="text-sm tnum">
                      {s._count.classes}
                    </TD>
                    <TD align="right" className="text-sm tnum">
                      {s._count.enrollments}
                    </TD>
                    <TD align="right" className="text-sm tnum">
                      {s._count.exams}
                    </TD>
                    <TD>
                      <span className="flex flex-wrap items-center gap-1.5">
                        {s.isCurrent ? <Badge tone="success">current</Badge> : null}
                        {s.isLocked ? <Badge tone="neutral">locked</Badge> : null}
                        {!s.isCurrent && !s.isLocked ? (
                          <span className="text-sm text-ink-subtle">Open</span>
                        ) : null}
                      </span>
                    </TD>
                    {canManage ? (
                      <TD align="right">
                        <SessionControls
                          id={s.id}
                          name={s.name}
                          isCurrent={s.isCurrent}
                          isLocked={s.isLocked}
                        />
                      </TD>
                    ) : null}
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <p className="text-xs text-ink-subtle">
        Bulk promotion between sessions is not built yet — students are moved class by class from
        their own records until it is.
      </p>
    </div>
  )
}
