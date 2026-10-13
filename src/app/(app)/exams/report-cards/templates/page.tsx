import Link from 'next/link'
import { requireContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  ensureDefaultReportCardTemplate,
  listReportCardTemplates,
} from '@/server/modules/exams/report-templates'
import { parseReportCardConfig } from '@/lib/exams/report-card-config'
import { ReportCardTemplateForm } from '../template-form'

export const metadata = { title: 'Report card templates' }

export default async function ReportCardTemplatesPage() {
  const ctx = await requireContext('exams.manage')
  await ensureDefaultReportCardTemplate(ctx)
  const templates = await listReportCardTemplates(ctx)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Report card templates & section builder"
        description="Choose the layout, header, theme colour and the Part 2 competencies and co-scholastic domains printed on each card."
        actions={
          <div className="flex gap-4">
            <Link href="/exams/report-cards?tab=sample" className="text-sm text-[var(--brand-600)] hover:underline">Open design studio</Link>
            <Link href="/exams/report-cards" className="text-sm text-[var(--brand-600)] hover:underline">Back to report cards</Link>
          </div>
        }
      />

      {templates.map((template) => (
        <Card key={template.id} id={`t-${template.id}`} className="scroll-mt-20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {template.name}
              {template.isDefault ? <Badge tone="success">Default</Badge> : null}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ReportCardTemplateForm
              initial={{
                id: template.id,
                name: template.name,
                isDefault: template.isDefault,
                showAttendance: template.showAttendance,
                showRank: template.showRank,
                showRemarks: template.showRemarks,
                headerHtml: template.headerHtml ?? '',
                footerHtml: template.footerHtml ?? '',
                config: parseReportCardConfig(template.config),
              }}
            />
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle>New template</CardTitle>
        </CardHeader>
        <CardContent>
          <ReportCardTemplateForm />
        </CardContent>
      </Card>
    </div>
  )
}
