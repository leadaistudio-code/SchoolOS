import Link from 'next/link'
import { requireLabs } from '@/server/modules/labs/access'
import { getLab, templateOf } from '@/server/modules/labs/service'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const metadata = { title: 'Lab prints' }

type PrintLink = { href: string; label: string; hint: string }

export default async function LabPrintsPage({ params }: { params: Promise<{ labId: string }> }) {
  const { labId } = await params
  const ctx = await requireLabs()
  const lab = await getLab(ctx, labId)
  const template = templateOf(lab)
  const base = `/labs/${lab.id}/print`

  const board: PrintLink[] = [
    { href: `${base}/board`, label: 'All posters', hint: 'Every poster below, one per A4 page' },
    ...(template
      ? [
          { href: `${base}/board?poster=dos`, label: "Do's and don'ts", hint: 'Lab safety dos and don\u2019ts' },
          { href: `${base}/board?poster=rules`, label: 'Rules for students', hint: `${template.studentRules.length} rules` },
        ]
      : []),
    { href: `${base}/board?poster=emergency`, label: 'Emergency numbers', hint: 'With the lab\u2019s safety provisions' },
    { href: `${base}/board?poster=practicals`, label: 'List of practicals', hint: 'Grouped by class' },
    { href: `${base}/board?poster=timetable`, label: 'Lab timetable', hint: 'This week\u2019s booked practicals' },
  ]
  const registers: PrintLink[] = [
    ...(template ? [{ href: `${base}/readiness`, label: 'Readiness report', hint: 'Score, infrastructure checklist and shortfall' }] : []),
    { href: `${base}/register`, label: 'Stock register', hint: 'All items with a physical verification column' },
    { href: `${base}/register?kind=non-consumables`, label: 'Dead stock register', hint: 'Non-consumables only' },
    { href: `${base}/register?kind=consumables`, label: 'Consumables register', hint: 'Consumables only' },
    { href: `${base}/chemicals`, label: 'Chemical register', hint: 'Hazards, storage, expiry and safety data sheets' },
    { href: `${base}/breakage`, label: 'Breakage register', hint: 'Who broke what, and what was recovered' },
    { href: `${base}/inspections`, label: 'Inspection register', hint: 'Every recorded inspection' },
    { href: `${base}/incidents`, label: 'Incident register', hint: 'Accidents and first aid' },
    ...(template?.inspections.map((s) => ({
      href: `${base}/inspections?blank=${s.type}`,
      label: `Blank ${s.label.toLowerCase()} checklist`,
      hint: 'To fill by hand',
    })) ?? []),
  ]

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <LinkCard title="Display board" links={board} />
      <LinkCard title="Registers & reports" links={registers} />
    </div>
  )
}

function LinkCard({ title, links }: { title: string; links: PrintLink[] }) {
  return (
    <Card variant="elevated">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-line">
          {links.map((l) => (
            <li key={l.href}>
              <Link href={l.href} target="_blank" className="flex items-baseline justify-between gap-3 py-2 hover:text-brand">
                <span className="text-sm font-medium text-ink">{l.label}</span>
                <span className="text-right text-xs text-ink-muted">{l.hint}</span>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
