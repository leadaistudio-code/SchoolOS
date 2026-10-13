import Link from 'next/link'
import { DoorClosed, KeyRound, LogOut, ScanLine, TicketCheck } from 'lucide-react'
import { format } from 'date-fns'
import { requireContext } from '@/server/context'
import { listGatePasses } from '@/server/modules/front-office/gate-pass'
import { ColorBanner, ColorTile } from '@/components/dashboard/color-tiles'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { EmptyState } from '@/components/ui/states'
import { istClock } from '@/lib/ist-clock'
import { formatNumber } from '@/lib/utils'
import { IssueGatePassForm } from './issue-form'
import { STATUS_BADGE } from './status'

export const metadata = { title: 'Gate passes' }

export default async function GatePassesPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const ctx = await requireContext('frontoffice.view')
  const sp = await searchParams
  const today = istClock().iso
  const iso = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : today
  const passes = await listGatePasses(ctx, iso)
  const waiting = passes.filter((p) => p.status === 'AWAITING_OTP').length
  const ready = passes.filter((p) => p.status === 'APPROVED').length
  const left = passes.filter((p) => p.status === 'EXITED').length
  const canIssue = ctx.can('frontoffice.gatepass')

  return (
    <div className="space-y-4">
      <ColorBanner
        tone="admissions"
        eyebrow="Front office"
        title={iso === today ? 'Early pickups today' : `Gate passes on ${format(new Date(`${iso}T00:00:00`), 'd MMM yyyy')}`}
        description="Only people on a student's pickup list, or someone a parent approves with a one-time code, can take a child out. Parents get a message the moment the child leaves."
        actions={
          ctx.can('frontoffice.gate') ? (
            <Link href="/front-office/gate" className={buttonVariants({ variant: 'secondary' })}>
              <ScanLine className="size-4" aria-hidden /> Open gate scanner
            </Link>
          ) : null
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ColorTile label="Passes" value={formatNumber(passes.length)} sub="Issued this day" tone="admissions" icon={<TicketCheck className="size-5" aria-hidden />} />
        <ColorTile label="Waiting for parent" value={formatNumber(waiting)} sub="Code sent, not entered" tone="pending" icon={<KeyRound className="size-5" aria-hidden />} />
        <ColorTile label="Approved" value={formatNumber(ready)} sub="Still to leave the gate" tone="attendance" icon={<DoorClosed className="size-5" aria-hidden />} />
        <ColorTile label="Left school" value={formatNumber(left)} sub="Scanned out at the gate" tone="students" icon={<LogOut className="size-5" aria-hidden />} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card variant="elevated">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Passes</CardTitle>
              <CardDescription>Newest first.</CardDescription>
            </div>
            <form className="flex items-center gap-2">
              <input
                type="date"
                name="date"
                defaultValue={iso}
                max={today}
                className="h-9 rounded-[var(--radius-sm)] border border-line bg-surface px-2 text-sm text-ink"
              />
              <Button type="submit" variant="secondary" size="sm">
                Show
              </Button>
            </form>
          </CardHeader>
          <CardContent>
            {passes.length === 0 ? (
              <EmptyState title="No gate passes" description={canIssue ? 'Issue one from the form when a parent arrives.' : 'Nobody has been sent home early.'} />
            ) : (
              <ul className="divide-y divide-line">
                {passes.map((p) => {
                  const e = p.student.enrollments[0]
                  const badge = STATUS_BADGE[p.status]
                  return (
                    <li key={p.id}>
                      <Link href={`/front-office/gate-passes/${p.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 hover:bg-bg">
                        <span className="w-14 font-mono text-xs text-ink-subtle">{format(p.createdAt, 'HH:mm')}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-ink">
                            {p.student.firstName} {p.student.lastName}
                            <span className="ml-2 text-xs font-normal text-ink-subtle">{e ? `${e.classLevel.name} ${e.section.name}` : p.student.admissionNo}</span>
                          </span>
                          <span className="block text-xs text-ink-subtle">
                            With {p.pickupName}
                            {p.pickupRelation ? ` (${p.pickupRelation})` : ''} · {p.reason}
                          </span>
                        </span>
                        <span className="flex items-center gap-2">
                          {p.verification === 'OTP' ? <Badge tone="brand">OTP</Badge> : null}
                          <Badge tone={badge.tone}>{badge.label}</Badge>
                          {p.exitedAt ? <span className="text-xs text-ink-subtle">out {format(p.exitedAt, 'HH:mm')}</span> : null}
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {canIssue ? (
          <Card variant="elevated" className="h-fit">
            <CardHeader>
              <CardTitle>Issue a gate pass</CardTitle>
              <CardDescription>Find the student, pick who is collecting, give a reason.</CardDescription>
            </CardHeader>
            <CardContent>
              <IssueGatePassForm />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  )
}
