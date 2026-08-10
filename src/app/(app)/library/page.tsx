import { requireContext } from '@/server/context'
import { ModulePlaceholder } from '@/components/module-placeholder'

export const metadata = { title: "Library" }

export default async function Page() {
  await requireContext("library.view")

  return (
    <ModulePlaceholder
      title="Library"
      icon="Library"
      phase="Phase 6 - Operations"
      summary="Catalogue, circulation and fines. The book and loan records already exist in the database; the screens to work them are next."
      planned={[
        "Catalogue with categories and copies",
        "Issue and return with due dates",
        "Overdue tracking and fine calculation",
        "Per-student borrowing history",
        "Barcode and ISBN lookup",
      ]}
      breadcrumbs={[
        { label: "Library" },
      ]}
    />
  )
}
