import { requireContext } from '@/server/context'
import { ModulePlaceholder } from '@/components/module-placeholder'

export const metadata = { title: "Front Office" }

export default async function Page() {
  await requireContext("frontoffice.view")

  return (
    <ModulePlaceholder
      title="Front Office"
      icon="ConciergeBell"
      phase="Phase 6 - Operations"
      summary="The reception desk: who is in the building, who is expected, and who asked to see whom."
      planned={[
        "Visitor sign-in with photo and badge",
        "Appointment scheduling against staff",
        "Gate pass for early student pickup",
        "Postal and courier register",
        "Enquiry capture into the admissions pipeline",
      ]}
      related={[
        { label: "Staff Attendance", href: "/attendance/staff", description: "Who is in today" },
      ]}
      breadcrumbs={[
        { label: "Front Office" },
      ]}
    />
  )
}
