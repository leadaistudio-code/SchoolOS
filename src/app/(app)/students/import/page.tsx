import { requireContext } from '@/server/context'
import { assistantConfigured } from '@/server/assistant/providers'
import { hasFeature } from '@/server/entitlements'
import { FEATURE } from '@/lib/features'
import { listStudentImports } from '@/server/modules/imports/service'
import { PageHeader } from '@/components/page-header'
import { ImportWizard } from './import-wizard'

export const metadata = { title: 'Bulk Import' }

export default async function StudentImportPage() {
  const ctx = await requireContext('students.import')
  const batches = await listStudentImports(ctx)
  const smartImportAvailable =
    assistantConfigured() && (await hasFeature(ctx.tenant.id, FEATURE.MODULE_AI_ASSIST))

  return (
    <div>
      <PageHeader
        title="Bulk import"
        description="Download the school pack, send it to the office, and upload the filled workbook. Students import first; the other sheets are the rest of onboarding."
        breadcrumbs={[
          { label: 'Students', href: '/students' },
          { label: 'Bulk Import' },
        ]}
      />
      <ImportWizard initialBatches={batches} smartImportAvailable={smartImportAvailable} />
    </div>
  )
}
