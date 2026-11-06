import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireLabs } from '@/server/modules/labs/access'
import { apparatusOf } from '@/server/modules/labs/sessions'
import { compositeScience } from '@/lib/labs/templates'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PracticalForm } from '../../forms'
import { archiveExperimentAction } from '../../actions'

export const metadata = { title: 'Practical' }

export default async function PracticalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireLabs()
  const e = await ctx.db.labExperiment.findFirst({ where: { id, deletedAt: null } })
  if (!e) notFound()
  const canEdit = ctx.can('labs.manage')
  const catalogue = compositeScience.items.map((i) => ({ code: i.code, name: i.name, unit: i.unit, kind: i.kind }))

  return (
    <div className="max-w-3xl space-y-4">
      <Link href="/labs/practicals" className="text-xs text-ink-muted hover:underline">
        ← Practical library
      </Link>
      <Card variant="elevated">
        <CardHeader>
          <CardTitle>{e.title}</CardTitle>
        </CardHeader>
        <CardContent>
          {canEdit ? (
            <PracticalForm
              catalogue={catalogue}
              experiment={{
                id: e.id,
                labType: e.labType,
                classNumber: e.classNumber,
                subject: e.subject,
                title: e.title,
                aim: e.aim,
                safetyNotes: e.safetyNotes,
                apparatus: apparatusOf(e),
              }}
            />
          ) : (
            <div className="space-y-2 text-sm text-ink">
              {e.aim ? <p>{e.aim}</p> : null}
              {e.safetyNotes ? <p className="text-warning">Safety: {e.safetyNotes}</p> : null}
            </div>
          )}
        </CardContent>
      </Card>
      {canEdit ? (
        <form action={archiveExperimentAction.bind(null, e.id)}>
          <Button type="submit" variant="ghost" size="sm">
            Remove from library
          </Button>
        </form>
      ) : null}
    </div>
  )
}
