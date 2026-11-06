import { requireLabs } from '@/server/modules/labs/access'
import { getLab, infraAnswers, templateOf } from '@/server/modules/labs/service'
import { infraCheckPassed } from '@/lib/labs/readiness'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Notice } from '@/components/ui/states'
import { InfrastructureForm } from '../../forms'

export const metadata = { title: 'Lab infrastructure' }

export default async function LabInfrastructurePage({ params }: { params: Promise<{ labId: string }> }) {
  const { labId } = await params
  const ctx = await requireLabs()
  const lab = await getLab(ctx, labId)
  const template = templateOf(lab)
  if (!template) return <Notice tone="info">This lab has no standard template, so there is no infrastructure checklist.</Notice>
  const answers = infraAnswers(lab)
  const passed = template.infrastructure.filter((c) => infraCheckPassed(c, answers[c.code])).length

  return (
    <Card variant="elevated">
      <CardHeader>
        <CardTitle>
          Infrastructure checklist · {passed} of {template.infrastructure.length} met
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-ink-muted">From the {template.source}. Numbers are checked against the stated minimum.</p>
        <InfrastructureForm labId={lab.id} checks={template.infrastructure} answers={answers} canEdit={ctx.can('labs.manage')} />
      </CardContent>
    </Card>
  )
}
