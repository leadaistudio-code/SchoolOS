import Link from 'next/link'
import { ExternalLink, Video } from 'lucide-react'
import { requireLms } from '@/server/modules/lms/access'
import { listBatches, upcomingClasses } from '@/server/modules/lms/live'
import { classOptions, listCatalogue } from '@/server/modules/lms/school'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button-variants'
import { EmptyState } from '@/components/ui/states'
import { formatIst } from '@/lib/ist-clock'
import { meetingPlatform } from '@/lib/lms/live'
import { BatchButton } from './live-forms'

export const metadata = { title: 'Live classes · Robotics & AI' }

export default async function LiveClassesPage() {
  const ctx = await requireLms('lms.view')
  const canTeach = ctx.can('lms.teach')
  const [batches, upcoming, classes, courses] = await Promise.all([
    listBatches(ctx),
    upcomingClasses(ctx),
    canTeach ? classOptions(ctx) : Promise.resolve([]),
    canTeach ? listCatalogue(ctx) : Promise.resolve([]),
  ])

  return (
    <div className="space-y-4">
      <PageHeader
        title="Live classes"
        description={`${batches.length} batch${batches.length === 1 ? '' : 'es'} · ${upcoming.length} class${upcoming.length === 1 ? '' : 'es'} in the next two weeks`}
        actions={
          canTeach ? (
            <BatchButton
              classes={classes}
              courses={courses.filter((c) => c.status === 'PUBLISHED').map((c) => ({ id: c.id, title: c.title }))}
            />
          ) : null
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Coming up</CardTitle>
        </CardHeader>
        {upcoming.length === 0 ? (
          <EmptyState title="Nothing scheduled" description="Open a batch and schedule a class. Students see it in their portal with a Join button." />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {upcoming.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <div className="w-28 shrink-0">
                  <p className="text-sm font-semibold text-ink">{formatIst(c.startsAt, 'EEE d MMM')}</p>
                  <p className="text-xs text-ink-muted">{formatIst(c.startsAt, 'h:mm a')} · {c.durationMinutes} min</p>
                </div>
                <div className="min-w-0 flex-1">
                  <Link href={`/lms/live/class/${c.id}`} className="block truncate text-sm font-medium text-ink hover:text-[var(--brand-600)]">
                    {c.title}
                  </Link>
                  <p className="truncate text-xs text-ink-subtle">
                    {c.batch.title}
                    {c.batch.instructorName ? ` · ${c.batch.instructorName}` : ''}
                  </p>
                </div>
                {c.state === 'cancelled' ? (
                  <Badge tone="neutral">Cancelled</Badge>
                ) : c.state === 'open' ? (
                  <>
                    <Badge tone="success" dot>Live now · {c._count.attendance} joined</Badge>
                    {c.meetingUrl ? (
                      <a href={c.meetingUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: 'sm' })}>
                        <Video /> Start {meetingPlatform(c.meetingUrl)}
                      </a>
                    ) : null}
                  </>
                ) : c.meetingUrl ? (
                  <a href={c.meetingUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
                    <ExternalLink /> {meetingPlatform(c.meetingUrl)}
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-ink">Batches</h2>
        {batches.length === 0 ? (
          <Card>
            <EmptyState
              title="No batches yet"
              description={canTeach ? 'Create a batch for a class, add your Zoom or Meet link, then schedule classes.' : 'Batches your school creates appear here.'}
            />
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {batches.map((b) => (
              <Link key={b.id} href={`/lms/live/${b.id}`} className="group">
                <Card className="h-full transition-shadow group-hover:shadow-md">
                  <CardContent className="space-y-1.5">
                    <p className="text-base font-semibold text-ink group-hover:text-[var(--brand-600)]">{b.title}</p>
                    <p className="text-sm text-ink-muted">
                      {b.audience}
                      {b.instructorName ? ` · ${b.instructorName}` : ''}
                    </p>
                    {b.course ? <p className="text-xs text-ink-subtle">Course: {b.course.title}</p> : null}
                    <p className="pt-1 text-xs text-ink-muted">
                      {b.nextClassAt ? `Next: ${formatIst(b.nextClassAt, 'EEE d MMM, h:mm a')} · ${b.upcoming} upcoming` : `${b.classes} classes · none upcoming`}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
