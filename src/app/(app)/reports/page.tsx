import { requireContext } from '@/server/context'
import { ModulePlaceholder } from '@/components/module-placeholder'

export const metadata = { title: "Reports & Analytics" }

export default async function Page() {
  await requireContext("reports.view")

  return (
    <ModulePlaceholder
      title="Reports & Analytics"
      icon="BarChart3"
      phase="Phase 8 - Insights"
      summary="Cross-module reporting: attendance against results, collection against class, admissions against source. The dashboard already answers today's questions."
      planned={[
        "Report builder with saved views",
        "Scheduled email delivery",
        "Excel and PDF export",
        "Term-on-term and year-on-year comparison",
        "A management summary pack",
      ]}
      related={[
        { label: "Dashboard", href: "/", description: "Today at a glance" },
        { label: "Attendance Reports", href: "/attendance/reports", description: "Attendance by class and date" },
        { label: "Outstanding", href: "/finance/outstanding", description: "Fee arrears" },
      ]}
      breadcrumbs={[
        { label: "Reports" },
      ]}
    />
  )
}
