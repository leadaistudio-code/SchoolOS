import Link from 'next/link'
import { format } from 'date-fns'
import { notFound } from 'next/navigation'
import { requireContext } from '@/server/context'
import { getEvent } from '@/server/modules/events/service'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { RegisterForm } from '../forms'

export const metadata = { title: 'Event' }

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireContext('events.view')
  let event
  try {
    event = await getEvent(ctx, id)
  } catch {
    notFound()
  }

  const students = ctx.can('events.manage')
    ? (
        await ctx.db.student.findMany({
          where: { status: 'ACTIVE', deletedAt: null },
          orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
          select: { id: true, firstName: true, lastName: true, admissionNo: true },
          take: 400,
        })
      ).map((s) => ({
        id: s.id,
        label: `${s.firstName} ${s.lastName} · ${s.admissionNo}`,
      }))
    : []

  return (
    <div className="space-y-6">
      <PageHeader
        title={event.title}
        description={`${format(event.startsAt, 'd MMM yyyy HH:mm')} – ${format(event.endsAt, 'HH:mm')}${
          event.venue ? ` · ${event.venue}` : ''
        }`}
        actions={
          <Link href="/events" className="text-sm text-[var(--brand-600)] hover:underline">
            Back
          </Link>
        }
      />

      <div className="flex flex-wrap gap-2">
        <Badge tone="neutral">{event.category}</Badge>
        {event.registrationOpen ? <Badge tone="success">Registration open</Badge> : null}
        {event.maxParticipants ? (
          <Badge tone="brand">
            {event.participants.length}/{event.maxParticipants}
          </Badge>
        ) : (
          <Badge tone="brand">{event.participants.length} registered</Badge>
        )}
      </div>

      {event.description ? (
        <Card>
          <CardContent className="pt-5 text-sm text-ink-muted whitespace-pre-wrap">
            {event.description}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Participants</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {event.participants.length === 0 ? (
              <p className="text-sm text-ink-muted">Nobody registered yet.</p>
            ) : (
              event.participants.map((p) => (
                <div key={p.id} className="text-sm text-ink">
                  {p.student
                    ? `${p.student.firstName} ${p.student.lastName}`
                    : 'Participant'}
                  <span className="text-xs text-ink-subtle"> · {p.role}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {ctx.can('events.manage') ? (
          <Card>
            <CardHeader>
              <CardTitle>Register student</CardTitle>
            </CardHeader>
            <CardContent>
              <RegisterForm eventId={event.id} students={students} />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  )
}
