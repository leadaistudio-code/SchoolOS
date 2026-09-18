import { requireContext } from '@/server/context'
import { bulkPhotoUploadSetup } from '@/server/modules/people/bulk-photos'
import { PageHeader } from '@/components/page-header'
import { Notice } from '@/components/ui/states'
import { BulkPhotoImporter } from './photo-importer'

export const metadata = { title: 'Bulk photo upload' }

export default async function BulkPhotoUploadPage() {
  const ctx = await requireContext()
  const setup = await bulkPhotoUploadSetup(ctx)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Bulk photo upload"
        description="Match profile photos by admission number or employee code before uploading."
      />
      <Notice tone="info" title="Prepare filenames before choosing files">
        Name each student photo with the admission number, such as ADM-2026-074.jpg. Name each
        staff photo with the employee code, such as EMP-001.jpg. Upload a ZIP or select multiple
        JPEG, PNG or WebP images.
      </Notice>
      <BulkPhotoImporter
        students={setup.students}
        staff={setup.staff}
        canUploadStudents={setup.canUploadStudents}
        canUploadStaff={setup.canUploadStaff}
      />
    </div>
  )
}
