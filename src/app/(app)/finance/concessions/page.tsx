import { requireContext } from '@/server/context'
import { ModulePlaceholder } from '@/components/module-placeholder'

export const metadata = { title: "Concessions" }

export default async function Page() {
  await requireContext("fees.concession")

  return (
    <ModulePlaceholder
      title="Concessions"
      icon="Percent"
      phase="Phase 4 - Finance"
      summary="Sibling discounts, staff wards and scholarships applied to a student's invoices as a rule rather than as a manual edit every term."
      planned={[
        "Percentage and flat-amount concessions",
        "Applied per fee head or across the invoice",
        "Approval trail with a reason",
        "Automatic application at invoice generation",
        "Concession register for audit",
      ]}
      related={[
        { label: "Fee Structure", href: "/finance/structures", description: "Heads and amounts" },
        { label: "Invoices", href: "/finance/invoices", description: "Current invoices" },
        { label: "Outstanding", href: "/finance/outstanding", description: "What is owed" },
      ]}
      breadcrumbs={[
        { label: "Finance", href: "/finance" },
        { label: "Concessions" },
      ]}
    />
  )
}
