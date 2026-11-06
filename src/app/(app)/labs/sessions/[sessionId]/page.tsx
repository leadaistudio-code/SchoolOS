import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireLabs } from '@/server/modules/labs/access'
import { sessionDetail } from '@/server/modules/labs/sessions'
import { studentNames } from '@/server/modules/labs/stock'
import { compositeScience } from '@/lib/labs/templates'
import { labelOf, MOVEMENT_TYPES } from '@/lib/labs/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Notice } from '@/components/ui/states'
import { ConductForm } from './conduct-form'

export const metadata = { title: 'Practical session' }

export default async function LabSessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params
  const ctx = await requireLabs()
  const detail = await sessionDetail(ctx, sessionId).catch(() => null)
  if (!detail) notFound()
  const { session, roster, items, apparatus } = detail
  const templateItem = new Map(compositeScience.items.map((i) => [i.code, i]))
  const missing = apparatus.filter((a) => a.short)
  const names = await studentNames(ctx, session.movements.map((m) => m.studentId ?? ''))

  return (
    <div className="space-y-4">
      <Link href="/labs/sessions" className="text-xs text-ink-muted hover:underline">
        ← Sessions
      </Link>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card variant="elevated">
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              {session.experiment?.title ?? 'Practical'}
              <Badge tone={session.status === 'COMPLETED' ? 'success' : session.status === 'CANCELLED' ? 'neutral' : 'info'}>
                {session.status.toLowerCase()}
              </Badge>
            </CardTitle>
            <p className="text-sm text-ink-muted">
              {detail.sectionLabel}
              {session.batch ? ` · ${session.batch}` : ''} · {detail.dateIso} · {session.startTime}–{session.endTime} · {session.lab.name}
              {detail.teacherLabel ? ` · ${detail.teacherLabel}` : ''}
            </p>
          </CardHeader>
          <CardContent>
            {session.status === 'SCHEDULED' ? (
              ctx.can('labs.sessions') ? (
                <ConductForm
                  sessionId={session.id}
                  students={roster.map((r) => ({ studentId: r.studentId, rollNumber: r.rollNumber, name: r.name, admissionNo: r.admissionNo }))}
                  items={items.map((i) => ({ id: i.id, name: i.name, unit: i.unit, kind: i.kind, quantity: i.quantity }))}
                  suggested={apparatus
                    .filter((a) => a.item && a.item.kind === 'CONSUMABLE')
                    .map((a) => ({ itemId: a.item!.id, qty: a.qty }))}
                />
              ) : (
                <p className="text-sm text-ink-muted">This session has not been conducted yet.</p>
              )
            ) : session.status === 'COMPLETED' ? (
              <div className="space-y-4">
                <ul className="divide-y divide-line text-sm">
                  {roster.map((r) => (
                    <li key={r.studentId} className="flex flex-wrap items-center gap-2 py-1.5">
                      <span className="min-w-0 flex-1 text-ink">{r.name}</span>
                      <Badge tone={r.saved?.present ? 'success' : 'neutral'}>{r.saved?.present ? 'Present' : 'Absent'}</Badge>
                      {r.saved?.recordDone ? <Badge tone="info">Record checked</Badge> : null}
                      {typeof r.saved?.marks === 'number' ? <span className="tnum text-ink-muted">{r.saved.marks} marks</span> : null}
                    </li>
                  ))}
                </ul>
                {session.movements.length ? (
                  <div>
                    <h3 className="text-sm font-semibold text-ink">Stock booked</h3>
                    <ul className="mt-1 space-y-0.5 text-sm text-ink-muted">
                      {session.movements.map((m) => (
                        <li key={m.id}>
                          {labelOf(MOVEMENT_TYPES, m.type)}: {m.item.name} {Math.abs(m.quantity)} {m.item.unit}
                          {m.studentId ? ` · ${names.get(m.studentId)}` : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {session.notes ? <p className="text-sm text-ink">{session.notes}</p> : null}
              </div>
            ) : (
              <p className="text-sm text-ink-muted">This session was cancelled.</p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          {session.experiment ? (
            <Card variant="elevated">
              <CardHeader>
                <CardTitle>Preparation</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {session.experiment.aim ? <p className="text-ink">{session.experiment.aim}</p> : null}
                {session.experiment.safetyNotes ? <Notice tone="warning">{session.experiment.safetyNotes}</Notice> : null}
                {missing.length && session.status === 'SCHEDULED' ? (
                  <Notice tone="danger" title="Not enough in the register">
                    {missing.map((a) => templateItem.get(a.itemCode)?.name ?? a.itemCode).join(', ')}
                  </Notice>
                ) : null}
                <ul className="space-y-1">
                  {apparatus.map((a) => {
                    const t = templateItem.get(a.itemCode)
                    return (
                      <li key={a.itemCode} className="flex justify-between gap-2">
                        <span className={a.short ? 'text-[var(--danger)]' : 'text-ink'}>{a.item?.name ?? t?.name ?? a.itemCode}</span>
                        <span className="tnum text-ink-muted">
                          {a.qty} {a.item?.unit ?? t?.unit}
                          {a.item ? ` / ${a.item.quantity} held` : ' / not in register'}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  )
}
