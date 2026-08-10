import { requireContext } from '@/server/context'
import { ModulePlaceholder } from '@/components/module-placeholder'

export const metadata = { title: "Notifications" }

export default async function Page() {
  await requireContext('dashboard.view')

  return (
    <ModulePlaceholder
      title="Notifications"
      icon="Bell"
      phase="Phase 6 - Engagement"
      summary="The full history of everything the system has told you, filterable and searchable. The bell in the header already shows the recent ones."
      planned={[
        "Complete notification history",
        "Filter by category and date",
        "Per-channel delivery status",
        "Notification preferences per event",
        "Mark read in bulk",
      ]}
      related={[
        { label: "Notices", href: "/communication/notices", description: "Published announcements" },
      ]}
      breadcrumbs={[
        { label: "Communication" },
        { label: "Notifications" },
      ]}
    />
  )
}
