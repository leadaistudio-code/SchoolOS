import { requireContext } from '@/server/context'
import { ModulePlaceholder } from '@/components/module-placeholder'

export const metadata = { title: "Promotions" }

export default async function Page() {
  await requireContext("students.promote")

  return (
    <ModulePlaceholder
      title="Promotions"
      icon="ArrowUpRight"
      phase="Phase 10 - Data tools"
      summary="At the end of a session every child moves up, repeats, or leaves. Promotions will do that as one reviewed operation instead of hundreds of edits."
      planned={[
        "Promote a whole class or section",
        "Hold back individual students with a reason",
        "Carry forward or close outstanding fees",
        "Mark leavers as alumni",
        "A preview of every change before it is applied",
      ]}
      related={[
        { label: "All Students", href: "/students", description: "Browse the current roll" },
        { label: "Classes & Sections", href: "/academics/classes", description: "Structure for the new session" },
      ]}
      breadcrumbs={[
        { label: "Students", href: "/students" },
        { label: "Promotions" },
      ]}
    />
  )
}
