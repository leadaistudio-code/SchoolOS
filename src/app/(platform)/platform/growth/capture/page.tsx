import { requirePlatformContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { FieldCaptureForm } from './capture-form'

export const metadata = { title: 'Field capture · Growth CRM' }

export default async function GrowthCapturePage() {
  await requirePlatformContext('platform.crm_create')

  return (
    <div className="mx-auto max-w-lg space-y-4 pb-8">
      <PageHeader
        title="Field capture"
        description="Fill this before you leave the school — school, contact, visit note, and next follow-up."
        breadcrumbs={[{ label: 'Growth CRM', href: '/platform/growth' }, { label: 'Field capture' }]}
      />
      <Card>
        <CardContent className="pt-4">
          <FieldCaptureForm />
        </CardContent>
      </Card>
    </div>
  )
}
