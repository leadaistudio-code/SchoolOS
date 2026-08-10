import { requireContext } from '@/server/context'
import { ModulePlaceholder } from '@/components/module-placeholder'

export const metadata = { title: "Marks Entry" }

export default async function Page() {
  await requireContext("exams.marks")

  return (
    <ModulePlaceholder
      title="Marks Entry"
      icon="PencilRuler"
      phase="Built - open it from an examination"
      summary="Marks are entered against a specific examination, so the entry grid opens from the examination itself rather than standing alone here."
      planned={[
        "Pick an examination to enter marks for",
        "Per-subject entry grids with absence handling",
        "Validation against the maximum for the paper",
        "Autosave as you type",
      ]}
      related={[
        { label: "Examinations", href: "/exams", description: "Open an exam, then Enter marks" },
        { label: "Results", href: "/exams/results", description: "Computed results and ranking" },
      ]}
      breadcrumbs={[
        { label: "Examination", href: "/exams" },
        { label: "Marks Entry" },
      ]}
    />
  )
}
