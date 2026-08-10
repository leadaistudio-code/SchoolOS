import { requireContext } from '@/server/context'
import { ModulePlaceholder } from '@/components/module-placeholder'

export const metadata = { title: "Student Documents" }

export default async function Page() {
  await requireContext("students.documents")

  return (
    <ModulePlaceholder
      title="Student Documents"
      icon="FolderOpen"
      phase="Phase 10 - Data tools"
      summary="Birth certificates, transfer certificates and medical notes belong on the student record, with an audit trail of who looked at them."
      planned={[
        "Upload against a student record",
        "Document type and expiry tracking",
        "Access recorded in the audit log",
        "Bulk download for a class",
        "Missing-document report",
      ]}
      related={[
        { label: "All Students", href: "/students", description: "Documents appear on each record" },
      ]}
      breadcrumbs={[
        { label: "Students", href: "/students" },
        { label: "Documents" },
      ]}
    />
  )
}
