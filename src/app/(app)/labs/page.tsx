import Link from 'next/link'
import { AlertTriangle, CalendarClock, FlaskConical, Gauge } from 'lucide-react'
import { requireLabs } from '@/server/modules/labs/access'
import { labAlerts, labFormOptions, listLabs, readinessFor } from '@/server/modules/labs/service'
import { listSessions } from '@/server/modules/labs/sessions'
import { schoolToday } from '@/lib/periods'
import { labelOf, LAB_TYPES } from '@/lib/labs/types'
import { ColorBanner, ColorTile } from '@/components/dashboard/color-tiles'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState, Notice } from '@/components/ui/states'
import { buttonVariants } from '@/components/ui/button-variants'
import { formatNumber } from '@/lib/utils'
import { CreateLabForm } from './forms'
import { ReadinessMeter } from './readiness-meter'

export const metadata = { title: 'Labs' }

export default async function LabsPage() {
  const ctx = await requireLabs()
  const labs = await listLabs(ctx)
  const today = schoolToday()
  const [readiness, alerts, upcoming, options] = await Promise.all([
    readinessFor(ctx, labs),
    labAlerts(ctx, labs),
    listSessions(ctx, { status: 'SCHEDULED', from: today, take: 8 }),
    ctx.can('labs.manage') ? labFormOptions(ctx) : Promise.resolve(null),
  ])
  const scores = [...readiness.values()].filter((r): r is NonNullable<typeof r> => !!r)
  const avg = scores.length ? Math.round(scores.reduce((s, r) => s + r.score, 0) / scores.length) : null

  return (
    <div className="space-y-4">
      <ColorBanner
        tone="attendance"
        eyebrow="Labs"
        title={labs.length ? `${labs.length} lab${labs.length > 1 ? 's' : ''} · readiness ${avg ?? '—'}%` : 'Set up your school labs'}
        description="Science and Robotics & AI labs: register, practicals, safety records and readiness in one place."
        actions={
          labs.length ? (
            <Link href="/labs/sessions" className={buttonVariants({ size: 'sm' })}>
              Book the lab
            </Link>
          ) : null
        }
      />

      {labs.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ColorTile label="Labs" value={formatNumber(labs.length)} sub="Set up" tone="attendance" icon={<FlaskConical className="size-5" aria-hidden />} />
          <ColorTile label="Readiness" value={avg === null ? '—' : `${avg}%`} sub="Average across labs" tone="students" icon={<Gauge className="size-5" aria-hidden />} />
          <ColorTile label="Needs attention" value={formatNumber(alerts.length)} sub="Stock, expiry, inspections" tone={alerts.length ? 'overdue' : 'parents'} href="#alerts" icon={<AlertTriangle className="size-5" aria-hidden />} />
          <ColorTile label="Upcoming practicals" value={formatNumber(upcoming.length)} sub="Booked from today" tone="staff" href="/labs/sessions" icon={<CalendarClock className="size-5" aria-hidden />} />
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          {labs.length === 0 ? (
            <Card variant="elevated">
              <CardContent className="pt-5">
                <EmptyState
                  title="No lab set up yet"
                  description={
                    options
                      ? 'Create a Composite Science Lab (CBSE SOP) or a Robotics & AI Lab (Atal Tinkering Lab guidelines). The required item list, infrastructure checklist and practicals load automatically.'
                      : 'Ask the principal or school admin to set up the lab.'
                  }
                />
              </CardContent>
            </Card>
          ) : (
            labs.map((lab) => {
              const r = readiness.get(lab.id)
              return (
                <Card key={lab.id} variant="elevated">
                  <CardContent className="flex flex-wrap items-center gap-4 pt-5">
                    {r ? <ReadinessMeter score={r.score} band={r.band} /> : null}
                    <div className="min-w-0 flex-1">
                      <Link href={`/labs/${lab.id}`} className="text-base font-semibold text-ink hover:underline">
                        {lab.name}
                      </Link>
                      <p className="text-sm text-ink-muted">
                        {labelOf(LAB_TYPES, lab.type)}
                        {lab.room ? ` · ${lab.room}` : ''}
                      </p>
                      {r ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {r.sections.map((s) => (
                            <Badge key={s.key} tone={s.score >= 0.9 ? 'success' : s.score >= 0.6 ? 'warning' : 'danger'}>
                              {s.label} {Math.round(s.score * 100)}%
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/labs/${lab.id}/register`} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                        Register
                      </Link>
                      <Link href={`/labs/${lab.id}`} className={buttonVariants({ size: 'sm' })}>
                        Open
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              )
            })
          )}

          {labs.length > 0 ? (
            <Card id="alerts" variant="elevated" className="scroll-mt-20">
              <CardHeader>
                <CardTitle>Needs attention · {alerts.length}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {alerts.length === 0 ? (
                  <Notice tone="success">Nothing is expired, low or overdue.</Notice>
                ) : (
                  alerts.slice(0, 20).map((a, i) => (
                    <Link
                      key={i}
                      href={a.href}
                      className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-line px-3 py-2 text-sm text-ink hover:bg-surface-2"
                    >
                      <Badge tone={a.tone === 'info' ? 'info' : a.tone}>{a.kind.replace('-', ' ')}</Badge>
                      <span className="min-w-0 flex-1">{a.text}</span>
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          {upcoming.length > 0 ? (
            <Card variant="elevated">
              <CardHeader>
                <CardTitle>Next practicals</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-line text-sm">
                  {upcoming.map((s) => (
                    <li key={s.id} className="py-2">
                      <Link href={`/labs/sessions/${s.id}`} className="font-medium text-ink hover:underline">
                        {s.experiment?.title ?? 'Practical'}
                      </Link>
                      <p className="text-xs text-ink-muted">
                        {s.dateIso} · {s.startTime}–{s.endTime} · {s.sectionLabel} · {s.lab.name}
                      </p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
          {options ? (
            <Card variant="elevated">
              <CardHeader>
                <CardTitle>{labs.length ? 'Add another lab' : 'Set up a lab'}</CardTitle>
              </CardHeader>
              <CardContent>
                <CreateLabForm staff={options.staff} />
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  )
}
