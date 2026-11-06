import Link from 'next/link'
import { requireLabs } from '@/server/modules/labs/access'
import { getLab, templateOf } from '@/server/modules/labs/service'
import { listIncidents, listInspections, listWaste } from '@/server/modules/labs/safety'
import { studentNames } from '@/server/modules/labs/stock'
import { schoolToday } from '@/lib/periods'
import { INCIDENT_SEVERITIES, INCIDENT_TYPES, INSPECTION_TYPES, labelOf, WASTE_CATEGORIES } from '@/lib/labs/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { buttonVariants } from '@/components/ui/button-variants'
import { CloseIncidentForm, IncidentForm, InspectionForm, WasteForm } from '../../forms'

export const metadata = { title: 'Lab safety' }

const DAY = 86_400_000

export default async function LabSafetyPage({ params }: { params: Promise<{ labId: string }> }) {
  const { labId } = await params
  const ctx = await requireLabs()
  const lab = await getLab(ctx, labId)
  const template = templateOf(lab)
  const today = schoolToday()
  const [inspections, incidents, waste] = await Promise.all([
    listInspections(ctx, labId),
    listIncidents(ctx, labId),
    listWaste(ctx, labId),
  ])
  const names = await studentNames(ctx, incidents.flatMap((i) => i.studentIds))
  const canRecord = ctx.can('labs.safety')
  const todayMs = new Date(`${today}T00:00:00.000Z`).getTime()

  const schedule = (template?.inspections ?? []).map((spec) => {
    const last = inspections.find((i) => i.type === spec.type)
    const due = last ? new Date(last.inspectedOn.getTime() + spec.everyDays * DAY) : null
    const overdue = !due || due.getTime() <= todayMs
    return { spec, last, due, overdue }
  })

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
      <div className="space-y-4">
        <Card id="inspections" variant="elevated" className="scroll-mt-20">
          <CardHeader>
            <CardTitle>Inspections</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-3">
              {schedule.map(({ spec, last, due, overdue }) => (
                <div key={spec.type} className="rounded-[var(--radius-sm)] border border-line p-3">
                  <p className="text-sm font-medium text-ink">{spec.label}</p>
                  <p className="text-xs text-ink-muted">Every {spec.everyDays === 1 ? 'day' : `${spec.everyDays} days`}</p>
                  <p className="mt-1 text-xs">
                    {last ? `Last ${last.inspectedOn.toISOString().slice(0, 10)}` : 'Never recorded'}
                  </p>
                  <Badge tone={overdue ? (spec.type === 'DAILY' ? 'neutral' : 'warning') : 'success'} className="mt-1">
                    {overdue ? 'Due' : `Next ${due!.toISOString().slice(0, 10)}`}
                  </Badge>
                </div>
              ))}
            </div>
            {inspections.length === 0 ? (
              <EmptyState title="No inspections recorded" />
            ) : (
              <ul className="divide-y divide-line text-sm">
                {inspections.slice(0, 30).map((i) => (
                  <li key={i.id} className="py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-ink">
                        {template?.inspections.find((s) => s.type === i.type)?.label ?? labelOf(INSPECTION_TYPES, i.type)}
                      </span>
                      <span className="text-ink-muted">{i.inspectedOn.toISOString().slice(0, 10)}</span>
                      <Badge tone={i.failed ? 'danger' : 'success'}>
                        {i.passed}/{i.passed + i.failed} passed
                      </Badge>
                      <span className="text-xs text-ink-subtle">{i.inspectorName}</span>
                    </div>
                    {i.issues ? <p className="mt-0.5 text-ink-muted">{i.issues}</p> : null}
                    {i.photoKeys.length ? (
                      <div className="mt-1 flex flex-wrap gap-2">
                        {i.photoKeys.map((k, n) => (
                          <a key={k} href={`/api/v1/files/${encodeURIComponent(k)}`} className="text-xs underline">
                            Photo {n + 1}
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            <Link href={`/labs/${lab.id}/print/inspections`} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              Print inspection register
            </Link>
          </CardContent>
        </Card>

        <Card id="incidents" variant="elevated" className="scroll-mt-20">
          <CardHeader>
            <CardTitle>Incident register · {incidents.filter((i) => i.status === 'OPEN').length} open</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {incidents.length === 0 ? (
              <EmptyState title="No incidents recorded" />
            ) : (
              <ul className="divide-y divide-line text-sm">
                {incidents.map((i) => (
                  <li key={i.id} className="py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={INCIDENT_SEVERITIES.find((s) => s.value === i.severity)?.tone ?? 'neutral'}>
                        {labelOf(INCIDENT_SEVERITIES, i.severity)}
                      </Badge>
                      <span className="font-medium text-ink">{labelOf(INCIDENT_TYPES, i.type)}</span>
                      <span className="text-ink-muted">{i.occurredAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}</span>
                      <Badge tone={i.status === 'OPEN' ? 'warning' : 'success'}>{i.status === 'OPEN' ? 'Open' : 'Closed'}</Badge>
                    </div>
                    <p className="mt-1 text-ink">{i.description}</p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {[
                        i.studentIds.length ? `Students: ${i.studentIds.map((s) => names.get(s) ?? 'student').join(', ')}` : null,
                        i.firstAidGiven ? 'First aid given' : null,
                        i.parentInformed ? 'Parents informed' : null,
                        i.reportedByLabel ? `Reported by ${i.reportedByLabel}` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {i.actionTaken ? <p className="mt-0.5 text-xs text-ink">Action: {i.actionTaken}</p> : null}
                    {i.photoKeys.length ? (
                      <div className="mt-1 flex flex-wrap gap-2">
                        {i.photoKeys.map((k, n) => (
                          <a key={k} href={`/api/v1/files/${encodeURIComponent(k)}`} className="text-xs underline">
                            Photo {n + 1}
                          </a>
                        ))}
                      </div>
                    ) : null}
                    {i.status === 'OPEN' && canRecord ? <CloseIncidentForm labId={lab.id} incidentId={i.id} /> : null}
                  </li>
                ))}
              </ul>
            )}
            <Link href={`/labs/${lab.id}/print/incidents`} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              Print incident register
            </Link>
          </CardContent>
        </Card>

        <Card id="waste" variant="elevated" className="scroll-mt-20">
          <CardHeader>
            <CardTitle>Waste disposal log</CardTitle>
          </CardHeader>
          <CardContent>
            {waste.length === 0 ? (
              <EmptyState title="No disposals logged" description="Log each handover of lab waste, including flammable bottles packed separately." />
            ) : (
              <ul className="divide-y divide-line text-sm">
                {waste.map((w) => (
                  <li key={w.id} className="flex flex-wrap gap-2 py-2">
                    <span className="text-ink-muted">{w.disposedOn.toISOString().slice(0, 10)}</span>
                    <span className="font-medium text-ink">{labelOf(WASTE_CATEGORIES, w.category)}</span>
                    {w.quantity ? (
                      <span className="text-ink-muted">
                        {w.quantity} {w.unit}
                      </span>
                    ) : null}
                    {w.handedTo ? <span className="text-ink-muted">→ {w.handedTo}</span> : null}
                    {w.notes ? <span className="text-ink-subtle">{w.notes}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {canRecord ? (
        <div className="space-y-4">
          {template ? (
            <Card variant="elevated">
              <CardHeader>
                <CardTitle>Record an inspection</CardTitle>
              </CardHeader>
              <CardContent>
                <InspectionForm labId={lab.id} today={today} specs={template.inspections.map((s) => ({ type: s.type, label: s.label, items: s.items }))} />
              </CardContent>
            </Card>
          ) : null}
          <Card variant="elevated">
            <CardHeader>
              <CardTitle>Report an incident</CardTitle>
            </CardHeader>
            <CardContent>
              <IncidentForm labId={lab.id} />
            </CardContent>
          </Card>
          <Card variant="elevated">
            <CardHeader>
              <CardTitle>Log waste disposal</CardTitle>
            </CardHeader>
            <CardContent>
              <WasteForm labId={lab.id} today={today} />
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  )
}
