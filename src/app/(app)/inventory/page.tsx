import { requireContext } from '@/server/context'
import { ModulePlaceholder } from '@/components/module-placeholder'

export const metadata = { title: "Inventory & Assets" }

export default async function Page() {
  await requireContext("inventory.view")

  return (
    <ModulePlaceholder
      title="Inventory & Assets"
      icon="Package"
      phase="Phase 6 - Operations"
      summary="Every desk, projector and laptop the school owns: where it is, who has it, and what condition it is in."
      planned={[
        "Asset register with categories",
        "Assignment to a room or a member of staff",
        "Condition and maintenance history",
        "Purchase and warranty records",
        "Depreciation and disposal",
      ]}
      breadcrumbs={[
        { label: "Inventory" },
      ]}
    />
  )
}
