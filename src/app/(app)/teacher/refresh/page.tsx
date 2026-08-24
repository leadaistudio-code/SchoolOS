import Link from 'next/link'
import { requireContext } from '@/server/context'
import { ApiException } from '@/server/api/response'
import {
  listMyRefreshers,
  getMyKnowledgeProfile,
  listMyTeachingSubjects,
  resolveConfig,
} from '@/server/modules/teacher-refresh/service'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, Section } from '@/components/ui/card'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { EmptyState, Notice } from '@/components/ui/states'
import { buttonVariants } from '@/components/ui/button-variants'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { BeforeYouTeach } from './before-you-teach'

export const metadata = { title: 'My Knowledge Refresh' }

const DATE = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' })

const TYPE_LABEL: Record<string, string> = {
  WEEKLY: 'Weekly refresh',
  MONTHLY: 'Monthly review',
  PRE_LECTURE: 'Before you teach',
  MANUAL: 'Brush-up',
}

/** Maps a readiness label to a badge tone, kept in step with the scoring bands. */
function readinessTone(label: string | null): BadgeTone {
  switch (label) {
    case 'Ready to teach':
      return 'success'
    case 'Good':
      return 'info'
    case 'Refresh recommended':
      return 'warning'
    default:
      return 'neutral'
  }
}

const PROFICIENCY: Record<string, { label: string; tone: BadgeTone }> = {
  STRONG: { label: 'Strong', tone: 'success' },
  GOOD: { label: 'Good', tone: 'info' },
  REFRESH_RECOMMENDED: { label: 'Refresh recommended', tone: 'warning' },
  DEVELOPING: { label: 'Developing', tone: 'neutral' },
}

/**
 * A teacher's own knowledge-refresh home.
 *
 * The stance is set by the layout: what is due comes first and reads as a short,
 * doable list; the knowledge profile below is framed as the teacher's own map of
 * where they are strong, not a scorecard someone else is keeping. Everything here
 * is the signed-in teacher's alone — the service re-checks ownership on every
 * call, and no principal or peer view is reachable from this page.
 */
export default async function TeacherRefreshPage() {
  const ctx = await requireContext('teacher_refresh.view_self')

  // The account holds the permission but is not on the teaching-staff roll: show
  // a plain explanation rather than letting the service's 403 become a 500.
  let data: Awaited<ReturnType<typeof listMyRefreshers>>
  try {
    data = await listMyRefreshers(ctx)
  } catch (error) {
    if (error instanceof ApiException && error.code === 'NOT_TEACHING_STAFF') {
      return (
        <div>
          <PageHeader title="My Knowledge Refresh" />
          <Card>
            <EmptyState
              title="Knowledge refreshers are for teaching staff"
              description="This space fills up once you are assigned classes to teach."
            />
          </Card>
        </div>
      )
    }
    throw error
  }

  const canTake = ctx.can('teacher_refresh.take')
  const [config, profile, subjects] = await Promise.all([
    resolveConfig(ctx),
    getMyKnowledgeProfile(ctx),
    canTake ? listMyTeachingSubjects(ctx) : Promise.resolve([]),
  ])
  const showBeforeYouTeach = canTake && config.preLectureEnabled && subjects.length > 0

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Knowledge Refresh"
        description="Short, private refreshers to keep you confident walking into every lesson"
      />

      {!data.enabled ? (
        <Notice tone="info" title="Refreshers are paused">
          Your school has not switched on scheduled refreshers yet. You can still pull up a quick
          Before You Teach refresher on any topic below.
        </Notice>
      ) : null}

      <Section title="Due now" description="Quick to finish — a few minutes each.">
        {data.dueNow.length === 0 ? (
          <Card>
            <EmptyState
              title="You’re all caught up"
              description="Nothing is waiting for you right now. Nicely done."
            />
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {data.dueNow.map((r) => (
              <RefresherCard key={r.id} r={r} />
            ))}
          </div>
        )}
      </Section>

      {data.overdue.length > 0 ? (
        <Section
          title="Past the window"
          description="Still worth doing — no penalty, just a nudge. Ask for more time if you need it."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {data.overdue.map((r) => (
              <RefresherCard key={r.id} r={r} overdue />
            ))}
          </div>
        </Section>
      ) : null}

      {showBeforeYouTeach ? (
        <Section
          title="Before You Teach"
          description="About to teach a topic? Pull up a quick refresher on just that material."
        >
          <BeforeYouTeach subjects={subjects} />
        </Section>
      ) : null}

      {data.completed.length > 0 ? (
        <Section title="Completed" description="Your recent refreshers and how they went.">
          <Card>
            <TableWrap>
              <Table>
                <THead>
                  <TR>
                    <TH>Refresher</TH>
                    <TH>Subject</TH>
                    <TH align="right">Score</TH>
                    <TH>Readiness</TH>
                  </TR>
                </THead>
                <TBody>
                  {data.completed.map((r) => (
                    <TR key={r.id}>
                      <TD className="text-ink">{TYPE_LABEL[r.type] ?? 'Refresher'}</TD>
                      <TD>
                        {r.subjectLabel}
                        <span className="text-ink-subtle"> · {r.className}</span>
                      </TD>
                      <TD align="right" className="text-ink">
                        {r.latestPercent == null ? '—' : `${r.latestPercent}%`}
                      </TD>
                      <TD>
                        {r.readinessLabel ? (
                          <Badge tone={readinessTone(r.readinessLabel)}>{r.readinessLabel}</Badge>
                        ) : (
                          '—'
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          </Card>
        </Section>
      ) : null}

      <Section
        title="Your knowledge profile"
        description="Where recent refreshers say you’re strongest — yours to see, and to steer what comes next."
      >
        {profile.length === 0 ? (
          <Card>
            <EmptyState
              title="No profile yet"
              description="Complete a refresher and your topic-by-topic map builds itself here."
            />
          </Card>
        ) : (
          <Card>
            <TableWrap>
              <Table>
                <THead>
                  <TR>
                    <TH>Topic</TH>
                    <TH>Subject</TH>
                    <TH>Standing</TH>
                    <TH align="right">Last refreshed</TH>
                  </TR>
                </THead>
                <TBody>
                  {profile.map((p) => {
                    const prof = PROFICIENCY[p.proficiency] ?? PROFICIENCY.DEVELOPING!
                    return (
                      <TR key={p.topicId}>
                        <TD className="text-ink">{p.topicName}</TD>
                        <TD>
                          {p.subjectName}
                          <span className="text-ink-subtle"> · {p.chapterName}</span>
                        </TD>
                        <TD>
                          <Badge tone={prof.tone}>{prof.label}</Badge>
                        </TD>
                        <TD align="right">
                          {p.lastTestedAt ? DATE.format(new Date(p.lastTestedAt)) : '—'}
                        </TD>
                      </TR>
                    )
                  })}
                </TBody>
              </Table>
            </TableWrap>
          </Card>
        )}
      </Section>
    </div>
  )
}

type ListItem = Awaited<ReturnType<typeof listMyRefreshers>>['dueNow'][number]

/** One due (or overdue) refresher, with the estimate that makes it feel doable. */
function RefresherCard({ r, overdue }: { r: ListItem; overdue?: boolean }) {
  const minutes = Math.max(2, Math.ceil(r.questionCount * 1.5))
  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-base font-medium text-ink truncate">{r.subjectLabel}</p>
            <p className="text-sm text-ink-subtle">{r.className}</p>
          </div>
          <Badge tone={overdue ? 'warning' : 'brand'}>{TYPE_LABEL[r.type] ?? 'Refresher'}</Badge>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-sm text-ink-muted">
            {r.questionCount} questions · about {minutes} min
          </p>
          <Link href={`/teacher/refresh/${r.id}/take`} className={buttonVariants({ size: 'sm' })}>
            {overdue ? 'Catch up' : 'Start'}
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
