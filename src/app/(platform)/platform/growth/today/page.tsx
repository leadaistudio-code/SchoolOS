import Link from 'next/link'
import { format } from 'date-fns'
import { requirePlatformContext } from '@/server/context'
import { fieldDay } from '@/server/modules/platform/growth/service'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { GrowthQuickAdd } from '../quick-add'
import { completeFollowUpAction, completeMeetingAction, setTaskStatusAction } from '../actions'

export const metadata = { title: 'Today · Growth CRM' }

export default async function GrowthTodayPage() {
  const ctx = await requirePlatformContext('platform.crm')
  const day = await fieldDay(ctx)
  const canEdit = ctx.user.permissions.has('platform.crm_edit')

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
        rows={day.followUpsOverdue.map((row) => ({
          id: row.id,
          href: `/platform/growth/schools/${row.school.id}`,
          title: row.school.name,
          meta: `${format(row.dueAt, 'd MMM, HH:mm')} · ${row.type.toLowerCase()}`,
          phone: row.contact?.mobile,
          done:
            canEdit
              ? { action: completeFollowUpAction.bind(null, row.id, row.school.id) }
              : null,
        }))}
      />

      <Board
        title="Follow-ups today"
        empty="No follow-ups left today."
        rows={day.followUpsToday.map((row) => ({
          id: row.id,
          href: `/platform/growth/schools/${row.school.id}`,
          title: row.school.name,
          meta: `${format(row.dueAt, 'HH:mm')} · ${row.type.toLowerCase()}`,
          phone: row.contact?.mobile,
          done:
            canEdit
              ? { action: completeFollowUpAction.bind(null, row.id, row.school.id) }
              : null,
        }))}
      />

      <Board
        title="Meetings"
        empty="No meetings remaining today."
        rows={day.meetings.map((row) => ({
          id: row.id,
          href: `/platform/growth/schools/${row.school.id}`,
          title: row.school.name,
          meta: `${format(row.startsAt, 'HH:mm')} · ${row.meetingType} · ${row.mode === 'ONLINE' ? 'Online' : 'In person'}`,
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
          meta: `${row.school.name}${row.dueAt ? ` · ${format(row.dueAt, 'd MMM')}` : ''}`,
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
                    {format(v.visitedAt, 'HH:mm')}
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
    done: { action: (formData: FormData) => void | Promise<void> } | null
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
                <li key={row.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <Link href={row.href} className="text-sm font-medium text-ink hover:underline">
                      {row.title}
                    </Link>
                    <p className="text-xs text-ink-subtle">{row.meta}</p>
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
                  </div>
                  {row.done ? (
                    <form action={row.done.action}>
                      <button type="submit" className="min-h-9 text-xs font-medium text-[var(--brand-600)]">
                        Done
                      </button>
                    </form>
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
