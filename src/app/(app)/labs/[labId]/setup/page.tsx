import Link from 'next/link'
import { requireLabs } from '@/server/modules/labs/access'
import { emergencyContacts, getLab, infraAnswers, labFormOptions, templateOf } from '@/server/modules/labs/service'
import { registerRows } from '@/server/modules/labs/stock'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button-variants'
import { CountForm, InfrastructureForm, LabDetailsForm } from '../../forms'

export const metadata = { title: 'Set up lab' }

export default async function LabSetupPage({ params }: { params: Promise<{ labId: string }> }) {
  const { labId } = await params
  const ctx = await requireLabs('labs.stock')
  const lab = await getLab(ctx, labId)
  const template = templateOf(lab)
  const [rows, options] = await Promise.all([
    registerRows(ctx, labId),
    ctx.can('labs.manage') ? labFormOptions(ctx) : Promise.resolve(null),
  ])
  const answers = infraAnswers(lab)
  const infraDone = template ? Object.keys(answers).length > 0 : true
  const stockDone = rows.some((r) => r.quantity > 0)
  const contactsDone = emergencyContacts(lab).length > 0

  const Step = ({ n, title, done }: { n: number; title: string; done: boolean }) => (
    <CardTitle className="flex items-center gap-2">
      <span className="grid size-6 place-items-center rounded-full bg-[var(--brand-50)] text-xs font-bold text-[var(--brand-600)]">{n}</span>
      {title}
      <Badge tone={done ? 'success' : 'neutral'}>{done ? 'Done' : 'To do'}</Badge>
    </CardTitle>
  )

  return (
    <div className="space-y-4">
      {template ? (
        <Card variant="elevated">
          <CardHeader>
            <Step n={1} title="Tick what the room already has" done={infraDone} />
          </CardHeader>
          <CardContent>
            <InfrastructureForm labId={lab.id} checks={template.infrastructure} answers={answers} canEdit={ctx.can('labs.manage')} />
          </CardContent>
        </Card>
      ) : null}

      <Card variant="elevated">
        <CardHeader>
          <Step n={template ? 2 : 1} title="Count what is in the lab today" done={stockDone} />
        </CardHeader>
        <CardContent>
          {rows.length ? (
            <CountForm
              labId={lab.id}
              rows={rows.map((r) => ({ id: r.id, name: r.name, unit: r.unit, requiredQty: r.requiredQty, quantity: r.quantity, category: r.category }))}
            />
          ) : (
            <p className="text-sm text-ink-muted">
              The register is empty.{' '}
              <Link href={`/labs/${lab.id}/register`} className="underline">
                Add items
              </Link>
            </p>
          )}
        </CardContent>
      </Card>

      {options ? (
        <Card variant="elevated">
          <CardHeader>
            <Step n={template ? 3 : 2} title="Staff and emergency numbers" done={contactsDone} />
          </CardHeader>
          <CardContent>
            <LabDetailsForm
              staff={options.staff}
              lab={{
                id: lab.id,
                name: lab.name,
                room: lab.room,
                inChargeStaffId: lab.inChargeStaffId,
                assistantStaffId: lab.assistantStaffId,
                notes: lab.notes,
                contacts: emergencyContacts(lab),
              }}
            />
          </CardContent>
        </Card>
      ) : null}

      <Link href={`/labs/${lab.id}`} className={buttonVariants({ variant: 'primary' })}>
        See readiness score
      </Link>
    </div>
  )
}
