import { requirePlatformContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { FieldCaptureForm } from './capture-form'

export const metadata = { title: 'Capture visit · Growth CRM' }

export default async function GrowthCapturePage() {
  await requirePlatformContext('platform.crm_create')

  return (
    <div className="mx-auto max-w-lg space-y-4 pb-8">
      <PageHeader
        title="Capture a school visit"
        description="Fill this before you leave the school: who you met, photos, what was said and when to follow up."
        breadcrumbs={[{ label: 'Growth CRM', href: '/platform/growth' }, { label: 'Capture visit' }]}
      />
      <Card>
        <CardContent className="pt-4">
          <FieldCaptureForm />
        </CardContent>
      </Card>
    </div>
  )
}
