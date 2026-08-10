import { requireContext } from '@/server/context'
import { ModulePlaceholder } from '@/components/module-placeholder'

export const metadata = { title: "Admission Leads" }

export default async function Page() {
  await requireContext("admissions.view")

  return (
    <ModulePlaceholder
      title="Admission Leads"
      icon="Kanban"
      phase="Phase 6 - Growth"
      summary="Enquiries are already being captured, and your dashboard shows the newest ones. The pipeline that works them into enrolments is next."
      planned={[
        "Kanban pipeline from enquiry to enrolment",
        "Follow-up reminders and call logs",
        "Source and conversion analytics",
        "Application forms and document collection",
        "One-click conversion to a student record",
      ]}
      related={[
        { label: "Dashboard", href: "/", description: "Latest enquiries" },
        { label: "Add Student", href: "/students/new", description: "Enrol directly for now" },
      ]}
      breadcrumbs={[
        { label: "Admissions" },
      ]}
    />
  )
}
