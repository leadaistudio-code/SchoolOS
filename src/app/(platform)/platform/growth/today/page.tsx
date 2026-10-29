import Link from 'next/link'
import { formatIst, istClock } from '@/lib/ist-clock'
import { requirePlatformContext } from '@/server/context'
import { fieldDay, listGoingCold, listNeedsNextStep } from '@/server/modules/platform/growth/service'
import { STAGE_LABELS } from '@/lib/growth-crm'
import { STALE_ALERT_DAYS } from '@/lib/growth-cadence'
import { isEscalated, overdueDays } from '@/lib/growth-reminders'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { GrowthQuickAdd } from '../quick-add'
import { completeFollowUpAction, completeMeetingAction, setTaskStatusAction, snoozeFollowUpAction } from '../actions'

const SNOOZES = [
  { label: 'Tomorrow', days: 1 },
  { label: '3 days', days: 3 },
  { label: 'Next week', days: 7 },
]

function snoozeButtons(id: string, schoolId: string) {
  return SNOOZES.map((s) => ({ label: s.label, action: snoozeFollowUpAction.bind(null, id, s.days, schoolId) }))
}

export const metadata = { title: 'Today · Growth CRM' }

export default async function GrowthTodayPage() {
  const ctx = await requirePlatformContext('platform.crm')
  const [day, needsNext, goingCold] = await Promise.all([
    fieldDay(ctx),
    listNeedsNextStep(ctx.db),
    listGoingCold(ctx.db),
  ])
  const canEdit = ctx.user.permissions.has('platform.crm_edit')
  const today = istClock().iso

  return (
    <div className="space-y-4">
      <PageHeader
        title="Today"
        description="What to do on the road."
        breadcrumbs={[{ label: 'Growth CRM', href: '/platform/growth' }, { label: 'Today' }]}
        actions={canEdit ? <GrowthQuickAdd /> : null}
      />

      <div className="grid grid-cols-2 gap-2 sm:hidden">
        <QuickLink href="/platform/growth/capture" label="Field capture" />
        <QuickLink href="/platform/growth/log?kind=visit" label="Log visit" />
        <QuickLink href="/platform/growth/log?kind=call" label="Log call" />
        <QuickLink href="/platform/growth/log?kind=follow-up" label="Follow-up" />
      </div>

      <Board
        title="Overdue follow-ups"
        empty="Nothing overdue."
        rows={day.followUpsOverdue.map((row) => {
          const late = overdueDays(row.dueAt, today)
          const escalated = isEscalated(row.dueAt, today)
          return {
            id: row.id,
            href: `/platform/growth/schools/${row.school.id}`,
            title: row.school.name,
            meta: `${formatIst(row.dueAt, 'd MMM, HH:mm')} · ${row.type.toLowerCase()}${late ? ` · ${late}d overdue` : ''}`,
            escalated,
            phone: row.contact?.mobile,
            done: canEdit ? { action: completeFollowUpAction.bind(null, row.id, row.school.id) } : null,
            snooze: canEdit ? snoozeButtons(row.id, row.school.id) : [],
          }
        })}
      />

      <Board
        title="Follow-ups today"
        empty="No follow-ups left today."
        rows={day.followUpsToday.map((row) => ({
          id: row.id,
          href: `/platform/growth/schools/${row.school.id}`,
          title: row.school.name,
          meta: `${formatIst(row.dueAt, 'HH:mm')} · ${row.type.toLowerCase()}`,
          phone: row.contact?.mobile,
          done: canEdit ? { action: completeFollowUpAction.bind(null, row.id, row.school.id) } : null,
          snooze: canEdit ? snoozeButtons(row.id, row.school.id) : [],
        }))}
      />

      <Board
        title={`No next step booked · ${needsNext.length}`}
        empty="Every worked lead has a follow-up or meeting booked."
        rows={needsNext.map((s) => ({
          id: s.id,
          href: `/platform/growth/schools/${s.id}`,
          title: s.name,
          meta: `${STAGE_LABELS[s.stage]}${s.lastActivityAt ? ` · last touch ${formatIst(s.lastActivityAt, 'd MMM')}` : ''}`,
          phone: s.phone,
          done: null,
          book: canEdit ? `/platform/growth/log?kind=follow-up&schoolId=${s.id}` : undefined,
        }))}
      />

      <Board
        title={`Going cold · ${STALE_ALERT_DAYS}+ days quiet · ${goingCold.length}`}
        empty="No worked lead has gone quiet."
        rows={goingCold.map((s) => ({
          id: s.id,
          href: `/platform/growth/schools/${s.id}`,
          title: s.name,
          meta: `${STAGE_LABELS[s.stage]} · ${s.lastActivityAt ? `last touch ${formatIst(s.lastActivityAt, 'd MMM')}` : 'never touched'}`,
          phone: s.phone,
          done: null,
          book: canEdit ? `/platform/growth/log?kind=call&schoolId=${s.id}` : undefined,
        }))}
      />

      <Board
        title="Meetings"
        empty="No meetings remaining today."
        rows={day.meetings.map((row) => ({
          id: row.id,
          href: `/platform/growth/schools/${row.school.id}`,
          title: row.school.name,
          meta: `${formatIst(row.startsAt, 'HH:mm')} · ${row.meetingType} · ${row.mode === 'ONLINE' ? 'Online' : 'In person'}`,
          phone: row.school.phone,
          maps: [row.school.address, row.school.city].filter(Boolean).join(', '),
          done: canEdit ? { action: completeMeetingAction.bind(null, row.id, row.school.id) } : null,
        }))}
      />

      <Board
        title="Tasks"
        empty="No open tasks due."
        rows={day.tasks.map((row) => ({
          id: row.id,
          href: `/platform/growth/schools/${row.school.id}`,
          title: row.title,
          meta: `${row.school.name}${row.dueAt ? ` · ${formatIst(row.dueAt, 'd MMM')}` : ''}`,
          done: canEdit ? { action: setTaskStatusAction.bind(null, row.id, row.school.id, 'COMPLETED') } : null,
        }))}
      />

      {day.visits.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Visits logged today</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-[var(--border)]">
              {day.visits.map((v) => (
                <li key={v.id} className="py-2">
                  <Link href={`/platform/growth/schools/${v.school.id}`} className="text-sm font-medium text-ink hover:underline">
                    {v.school.name}
                  </Link>
                  <p className="text-xs text-ink-subtle">
                    {formatIst(v.visitedAt, 'HH:mm')}
                    {v.meetingType ? ` · ${v.meetingType}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-12 items-center justify-center rounded-[var(--radius)] border border-line bg-surface px-3 text-sm font-medium text-ink"
    >
      {label}
    </Link>
  )
}

function Board({
  title,
  empty,
  rows,
}: {
  title: string
  empty: string
  rows: {
    id: string
    href: string
    title: string
    meta: string
    phone?: string | null
    maps?: string
    escalated?: boolean
    done: { action: (formData: FormData) => void | Promise<void> } | null
    snooze?: { label: string; action: (formData: FormData) => void | Promise<void> }[]
    book?: string
  }[]
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="py-1">
        {rows.length === 0 ? (
          <p className="py-4 text-sm text-ink-muted">{empty}</p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {rows.map((row) => {
              const digits = row.phone?.replace(/[^\d]/g, '') ?? ''
              return (
                <li
                  key={row.id}
                  className={cn(
                    'flex items-start justify-between gap-3 py-3',
                    row.escalated && '-mx-3 border-l-2 border-[var(--danger)] bg-[var(--danger-bg)] px-3',
                  )}
                >
                  <div className="min-w-0">
                    <Link href={row.href} className="text-sm font-medium text-ink hover:underline">
                      {row.title}
                    </Link>
                    <p className={cn('text-xs', row.escalated ? 'font-medium text-[var(--danger)]' : 'text-ink-subtle')}>
                      {row.escalated ? 'Escalated · ' : ''}
                      {row.meta}
                    </p>
                    {row.phone || row.maps ? (
                      <div className="mt-1 flex flex-wrap gap-3 text-xs">
                        {row.phone ? (
                          <a href={`tel:${row.phone}`} className="min-h-9 font-medium text-[var(--brand-600)]">
                            Call
                          </a>
                        ) : null}
                        {digits ? (
                          <a
                            href={`https://wa.me/${digits}`}
                            className="min-h-9 font-medium text-[var(--brand-600)]"
                          >
                            WhatsApp
                          </a>
                        ) : null}
                        {row.maps ? (
                          <a
                            href={`https://maps.google.com/?q=${encodeURIComponent(row.maps)}`}
                            className="min-h-9 font-medium text-[var(--brand-600)]"
                          >
                            Directions
                          </a>
                        ) : null}
                      </div>
                    ) : null}
                    {row.snooze?.length ? (
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs">
                        <span className="text-ink-subtle">Move to</span>
                        {row.snooze.map((s) => (
                          <form key={s.label} action={s.action}>
                            <button type="submit" className="min-h-9 font-medium text-ink-muted hover:text-ink">
                              {s.label}
                            </button>
                          </form>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  {row.done ? (
                    <form action={row.done.action}>
                      <button type="submit" className="min-h-9 text-xs font-medium text-[var(--brand-600)]">
                        Done
                      </button>
                    </form>
                  ) : row.book ? (
                    <Link href={row.book} className="min-h-9 shrink-0 text-xs font-medium text-[var(--brand-600)]">
                      Book next step
                    </Link>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
