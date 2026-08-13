import Link from 'next/link'
import { requireContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ensureDefaultReportCardTemplate,
  listReportCardTemplates,
} from '@/server/modules/exams/report-templates'
import { ReportCardTemplateForm } from '../template-form'

export const metadata = { title: 'Report card templates' }

export default async function ReportCardTemplatesPage() {
  const ctx = await requireContext('exams.manage')
  await ensureDefaultReportCardTemplate(ctx)
  const templates = await listReportCardTemplates(ctx)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Report card templates"
        description="Customise the layout shown when a report card is printed (browser print-to-PDF)."
        actions={
          <Link href="/exams/report-cards" className="text-sm text-[var(--brand-600)] hover:underline">
            Back to report cards
          </Link>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>New template</CardTitle>
        </CardHeader>
        <CardContent>
          <ReportCardTemplateForm />
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h2 className="text-base font-semibold text-ink">Saved templates ({templates.length})</h2>
        {templates.map((template) => (
          <Card key={template.id}>
            <CardHeader>
              <CardTitle>
                {template.name}
                {template.isDefault ? ' · default' : ''}
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
                }}
              />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
