import { requireContext } from '@/server/context'
import { ModulePlaceholder } from '@/components/module-placeholder'

export const metadata = { title: "Follow-ups" }

export default async function Page() {
  await requireContext("admissions.manage")

  return (
    <ModulePlaceholder
      title="Follow-ups"
      icon="PhoneCall"
      phase="Phase 6 - Growth"
      summary="The call list: which families to contact today, what was said last time, and what was promised."
      planned={[
        "Due and overdue follow-up queue",
        "Call outcome logging",
        "Reassignment between counsellors",
        "Automated reminder scheduling",
        "Conversion attribution",
      ]}
      related={[
        { label: "Dashboard", href: "/", description: "Latest enquiries" },
      ]}
      breadcrumbs={[
        { label: "Admissions", href: "/admissions" },
        { label: "Follow-ups" },
      ]}
    />
  )
}
