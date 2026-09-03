import Link from 'next/link'
import { requirePlatformContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { listOperators } from '@/server/modules/platform/growth/service'
import { NewSchoolForm } from '../new-school-form'

export const metadata = { title: 'New school · Growth CRM' }

export default async function NewCrmSchoolPage() {
  const ctx = await requirePlatformContext('platform.crm_create')
  const operators = await listOperators(ctx)

  return (
    <div className="space-y-4 max-w-3xl">
      <PageHeader
        title="New school"
        description="Prospect — not a MyCampusView tenant until the deal is won."
        breadcrumbs={[
          { label: 'Growth CRM', href: '/platform/growth' },
          { label: 'New school' },
        ]}
        actions={
          <Link href="/platform/growth/schools" className="text-sm text-[var(--brand-600)] hover:underline">
            Back to list
          </Link>
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>School details</CardTitle>
        </CardHeader>
        <CardContent>
          <NewSchoolForm operators={operators} />
        </CardContent>
      </Card>
    </div>
  )
}
