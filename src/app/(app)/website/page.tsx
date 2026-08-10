import { requireContext } from '@/server/context'
import { ModulePlaceholder } from '@/components/module-placeholder'

export const metadata = { title: "School Website" }

export default async function Page() {
  await requireContext("website.view")

  return (
    <ModulePlaceholder
      title="School Website"
      icon="Globe"
      phase="Phase 9 - White label"
      summary="A public site for the school, edited here and published on the school's own domain."
      planned={[
        "Page and block editor",
        "News and announcements feed",
        "Photo galleries",
        "Online enquiry form feeding the admissions pipeline",
        "Custom domain with automatic certificates",
      ]}
      related={[
        { label: "Branding", href: "/settings/branding", description: "Colours and logo" },
      ]}
      breadcrumbs={[
        { label: "School Website" },
      ]}
    />
  )
}
