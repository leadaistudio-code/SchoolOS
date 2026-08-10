import { requireContext } from '@/server/context'
import { ModulePlaceholder } from '@/components/module-placeholder'

export const metadata = { title: "Sports" }

export default async function Page() {
  await requireContext("sports.view")

  return (
    <ModulePlaceholder
      title="Sports"
      icon="Medal"
      phase="Phase 6 - Operations"
      summary="Teams, fixtures and the children in them, kept alongside the academic record rather than in a separate notebook."
      planned={[
        "Sports and team registry",
        "Squad selection from the student roll",
        "Fixture calendar and results",
        "Coach assignment",
        "Achievements on the student record",
      ]}
      related={[
        { label: "Calendar", href: "/academics/calendar", description: "School calendar" },
      ]}
      breadcrumbs={[
        { label: "Sports" },
      ]}
    />
  )
}
