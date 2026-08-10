import { requireContext } from '@/server/context'
import { ModulePlaceholder } from '@/components/module-placeholder'

export const metadata = { title: "Events" }

export default async function Page() {
  await requireContext("events.view")

  return (
    <ModulePlaceholder
      title="Events"
      icon="PartyPopper"
      phase="Phase 6 - Operations"
      summary="Sports day, parent evenings and trips: planning, participation and permission, in one place."
      planned={[
        "Event planning with venue and organiser",
        "Participant lists and invitations",
        "Parental consent collection",
        "Budget and expense tracking",
        "Photo gallery per event",
      ]}
      related={[
        { label: "Calendar", href: "/academics/calendar", description: "Term dates and events" },
        { label: "Notices", href: "/communication/notices", description: "Announce an event" },
      ]}
      breadcrumbs={[
        { label: "Events" },
      ]}
    />
  )
}
