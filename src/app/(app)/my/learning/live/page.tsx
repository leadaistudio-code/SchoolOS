import Link from 'next/link'
import { CheckCircle2, Film, Video } from 'lucide-react'
import { requireLms } from '@/server/modules/lms/access'
import { myLiveClasses } from '@/server/modules/lms/live'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button-variants'
import { EmptyState, Notice } from '@/components/ui/states'
import { formatIst } from '@/lib/ist-clock'
import { JOIN_EARLY_MINUTES, meetingPlatform } from '@/lib/lms/live'

export const metadata = { title: 'Live classes' }

export default async function MyLiveClassesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const ctx = await requireLms('lms.learn')
  const [{ error }, { upcoming, past }] = await Promise.all([searchParams, myLiveClasses(ctx)])

  return (
    <div className="space-y-4">
      <PageHeader title="Live classes" description="Robotics & AI classes with your teacher, online" />
      {error ? <Notice tone="warning">{error}</Notice> : null}

      {upcoming.length === 0 ? (
        <Card>
          <EmptyState title="No live classes coming up" description="When your teacher schedules one, it appears here with a Join button." />
        </Card>
      ) : (
        <div className="space-y-3">
          {upcoming.map((c) => (
            <Card key={c.id} variant={c.state === 'open' ? 'elevated' : 'flat'}>
              <CardContent className="flex flex-wrap items-center gap-4">
                <div className="grid w-16 shrink-0 place-items-center rounded-lg bg-[var(--brand-50)] py-2 text-[var(--brand-600)]">
                  <span className="text-xs font-semibold uppercase">{formatIst(c.startsAt, 'MMM')}</span>
                  <span className="text-2xl font-bold leading-none">{formatIst(c.startsAt, 'd')}</span>
                  <span className="text-[11px]">{formatIst(c.startsAt, 'EEE')}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold text-ink">{c.title}</p>
                  <p className="text-sm text-ink-muted">
                    {formatIst(c.startsAt, 'h:mm a')} · {c.durationMinutes} min · {c.batch.title}
                    {c.batch.instructorName ? ` · ${c.batch.instructorName}` : ''}
                  </p>
                  {c.agenda ? <p className="mt-1 line-clamp-2 text-sm text-ink">{c.agenda}</p> : null}
                </div>
                {c.state === 'open' ? (
                  <a href={`/my/learning/live/${c.id}/join`} target="_blank" rel="noopener" className={buttonVariants({ size: 'lg' })}>
                    <Video /> Join {meetingPlatform(c.meetingUrl)}
                  </a>
                ) : (
                  <span className="text-right text-xs text-ink-subtle">
                    Join opens {JOIN_EARLY_MINUTES} min
                    <br />
                    before the start
                  </span>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {past.length ? (
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-ink">Past classes</h2>
          <Card>
            <ul className="divide-y divide-[var(--border)]">
              {past.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                  <span className="w-24 shrink-0 text-sm text-ink-muted">{formatIst(c.startsAt, 'd MMM')}</span>
                  <Link href={`/my/learning/live/${c.id}`} className="min-w-0 flex-1 truncate text-sm font-medium text-ink hover:text-[var(--brand-600)]">
                    {c.title}
                  </Link>
                  {c.state === 'cancelled' ? <Badge>Cancelled</Badge> : null}
                  {c.joined ? (
                    <span className="inline-flex items-center gap-1 text-xs text-success">
                      <CheckCircle2 className="size-3.5" aria-hidden /> Attended
                    </span>
                  ) : null}
                  {c.recordingUrl ? (
                    <Link href={`/my/learning/live/${c.id}`} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                      <Film /> Watch recording
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}
    </div>
  )
}
