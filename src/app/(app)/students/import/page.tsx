import { requireContext } from '@/server/context'
import { ModulePlaceholder } from '@/components/module-placeholder'

export const metadata = { title: "Bulk Import" }

export default async function Page() {
  await requireContext("students.import")

  return (
    <ModulePlaceholder
      title="Bulk Import"
      icon="Upload"
      phase="Phase 10 - Data tools"
      summary="Bringing a whole school onto SchoolOS by hand is not realistic, so imports will accept the spreadsheet you already keep and tell you what is wrong with it before anything is written."
      planned={[
        "CSV and Excel upload",
        "Column mapping with a saved template",
        "Row-level validation before commit",
        "A dry run that reports every rejection",
        "Rollback of a completed batch",
      ]}
      related={[
        { label: "All Students", href: "/students", description: "Browse the current roll" },
        { label: "Add Student", href: "/students/new", description: "Create one record" },
      ]}
      breadcrumbs={[
        { label: "Students", href: "/students" },
        { label: "Bulk Import" },
      ]}
    />
  )
}
