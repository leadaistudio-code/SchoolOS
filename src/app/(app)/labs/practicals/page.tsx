import Link from 'next/link'
import { requireLabs } from '@/server/modules/labs/access'
import { apparatusOf, listExperiments } from '@/server/modules/labs/sessions'
import { compositeScience } from '@/lib/labs/templates'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { buttonVariants } from '@/components/ui/button-variants'
import { PracticalForm } from '../forms'

export const metadata = { title: 'Practical library' }

export default async function PracticalsPage({ searchParams }: { searchParams: Promise<{ class?: string }> }) {
  const { class: rawClass } = await searchParams
  const classNumber = rawClass && /^\d+$/.test(rawClass) ? Number(rawClass) : undefined
  const ctx = await requireLabs()
  const experiments = await listExperiments(ctx, { classNumber })
  const itemName = new Map(compositeScience.items.map((i) => [i.code, i]))
  const classes = [6, 7, 8, 9, 10, 11, 12]

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <Card variant="elevated">
        <CardHeader>
          <CardTitle>Practical library · {experiments.length}</CardTitle>
          <div className="flex flex-wrap gap-1.5 pt-2">
            <Link href="/labs/practicals" className={buttonVariants({ variant: classNumber ? 'ghost' : 'subtle', size: 'sm' })}>
              All classes
            </Link>
            {classes.map((n) => (
              <Link key={n} href={`/labs/practicals?class=${n}`} className={buttonVariants({ variant: classNumber === n ? 'subtle' : 'ghost', size: 'sm' })}>
                Class {n}
              </Link>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {experiments.length === 0 ? (
            <EmptyState title="No practicals" description="Set up a lab to load its default practicals, or add your own." />
          ) : (
            <ul className="divide-y divide-line">
              {experiments.map((e) => {
                const apparatus = apparatusOf(e)
                return (
                  <li key={e.id} className="py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {e.classNumber ? <Badge tone="brand">Class {e.classNumber}</Badge> : null}
                      {e.subject ? <Badge tone="neutral">{e.subject}</Badge> : null}
                      <Link href={`/labs/practicals/${e.id}`} className="text-sm font-semibold text-ink hover:underline">
                        {e.title}
                      </Link>
                    </div>
                    {e.aim ? <p className="mt-1 text-sm text-ink-muted">{e.aim}</p> : null}
                    {apparatus.length ? (
                      <p className="mt-1 text-xs text-ink-subtle">
                        {apparatus
                          .map((a) => {
                            const t = itemName.get(a.itemCode)
                            return t ? `${t.name}${t.kind === 'CONSUMABLE' ? ` ${a.qty} ${t.unit}` : ` × ${a.qty}`}` : a.itemCode
                          })
                          .join(' · ')}
                      </p>
                    ) : null}
                    {e.safetyNotes ? <p className="mt-1 text-xs text-warning">Safety: {e.safetyNotes}</p> : null}
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
      {ctx.can('labs.manage') ? (
        <Card variant="elevated">
          <CardHeader>
            <CardTitle>Add a practical</CardTitle>
          </CardHeader>
          <CardContent>
            <PracticalForm catalogue={compositeScience.items.map((i) => ({ code: i.code, name: i.name, unit: i.unit, kind: i.kind }))} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
