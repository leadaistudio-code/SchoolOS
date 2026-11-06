import Link from 'next/link'
import { requireLabs } from '@/server/modules/labs/access'
import { emergencyContacts, getLab, labAlerts, labFormOptions, readinessFor } from '@/server/modules/labs/service'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Notice } from '@/components/ui/states'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { ReadinessMeter } from '../readiness-meter'
import { LabDetailsForm } from '../forms'
import { deleteLabAction } from '../actions'

export const metadata = { title: 'Lab overview' }

export default async function LabOverviewPage({ params }: { params: Promise<{ labId: string }> }) {
  const { labId } = await params
  const ctx = await requireLabs()
  const lab = await getLab(ctx, labId)
  const [readiness, alerts, stocked, options] = await Promise.all([
    readinessFor(ctx, [lab]),
    labAlerts(ctx, [lab]),
    ctx.db.labStockMovement.count({ where: { labId } }),
    ctx.can('labs.manage') ? labFormOptions(ctx) : Promise.resolve(null),
  ])
  const r = readiness.get(lab.id)
  const contacts = emergencyContacts(lab)

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-4">
        {stocked === 0 && ctx.can('labs.stock') ? (
          <Notice tone="info" title="Finish setting up this lab">
            Record what you have in stock and tick the infrastructure checklist to get your readiness score.{' '}
            <Link href={`/labs/${lab.id}/setup`} className="font-medium underline">
              Open the setup steps
            </Link>
          </Notice>
        ) : null}

        {r ? (
          <Card variant="elevated">
            <CardHeader>
              <CardTitle>Readiness</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-6">
                <ReadinessMeter score={r.score} band={r.band} size={110} />
                <ul className="min-w-56 flex-1 space-y-2">
                  {r.sections.map((s) => (
                    <li key={s.key}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-ink">{s.label}</span>
                        <span className="tnum text-ink-muted">
                          {Math.round(s.score * 100)}% · weight {s.weight}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.round(s.score * 100)}%`,
                            background: s.score >= 0.9 ? 'var(--success)' : s.score >= 0.6 ? 'var(--warning)' : 'var(--danger)',
                          }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {r.sections
                  .filter((s) => s.gaps.length)
                  .map((s) => (
                    <div key={s.key} className="rounded-[var(--radius-sm)] border border-line p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                        {s.label} · {s.gaps.length} gap{s.gaps.length > 1 ? 's' : ''}
                      </p>
                      <ul className="mt-1 space-y-0.5 text-sm text-ink">
                        {s.gaps.slice(0, 6).map((g) => (
                          <li key={g}>• {g}</li>
                        ))}
                        {s.gaps.length > 6 ? <li className="text-ink-subtle">…and {s.gaps.length - 6} more</li> : null}
                      </ul>
                    </div>
                  ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href={`/labs/${lab.id}/register?filter=shortfall`} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                  Shortfall list
                </Link>
                <Link href={`/labs/${lab.id}/print/readiness`} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                  Print readiness report
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Notice tone="info">This lab has no standard template, so no readiness score is calculated.</Notice>
        )}

        <Card variant="elevated">
          <CardHeader>
            <CardTitle>Needs attention · {alerts.length}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {alerts.length === 0 ? (
              <Notice tone="success">Nothing is expired, low or overdue.</Notice>
            ) : (
              alerts.map((a, i) => (
                <Link key={i} href={a.href} className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-line px-3 py-2 text-sm text-ink hover:bg-surface-2">
                  <Badge tone={a.tone === 'info' ? 'info' : a.tone}>{a.kind.replace('-', ' ')}</Badge>
                  <span className="min-w-0 flex-1">{a.text}</span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card variant="elevated">
          <CardHeader>
            <CardTitle>Lab details</CardTitle>
          </CardHeader>
          <CardContent>
            {options ? (
              <LabDetailsForm
                staff={options.staff}
                lab={{
                  id: lab.id,
                  name: lab.name,
                  room: lab.room,
                  inChargeStaffId: lab.inChargeStaffId,
                  assistantStaffId: lab.assistantStaffId,
                  notes: lab.notes,
                  contacts,
                }}
              />
            ) : (
              <ul className="space-y-1 text-sm text-ink">
                {contacts.map((c) => (
                  <li key={c.label}>
                    {c.label}: <span className="tnum">{c.phone}</span>
                  </li>
                ))}
                {contacts.length === 0 ? <li className="text-ink-muted">No emergency numbers recorded.</li> : null}
              </ul>
            )}
          </CardContent>
        </Card>
        {ctx.can('labs.manage') ? (
          <form action={deleteLabAction.bind(null, lab.id)}>
            <Button type="submit" variant="ghost" size="sm">
              Remove this lab
            </Button>
          </form>
        ) : null}
      </div>
    </div>
  )
}
