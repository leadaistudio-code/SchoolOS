import { Suspense } from 'react'
import { requirePlatformContext } from '@/server/context'
import {
  listContactsLite,
  listNextMeetingBySchool,
  listOperators,
  listSchoolOptions,
  listTemplates,
} from '@/server/modules/platform/growth/service'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { GrowthLogWorkbench } from './workbench'

export const metadata = { title: 'Quick log · Growth CRM' }

export default async function GrowthLogPage() {
  const ctx = await requirePlatformContext('platform.crm_edit')
  const canSend = ctx.user.permissions.has('platform.crm_comms')
  const [schools, operators, contacts, templates, nextMeetingBySchool] = await Promise.all([
    listSchoolOptions(ctx),
    listOperators(ctx),
    listContactsLite(ctx),
    canSend ? listTemplates(ctx, { activeOnly: true }) : Promise.resolve([]),
    listNextMeetingBySchool(ctx),
  ])
  const contactsBySchool: Record<
    string,
    { id: string; fullName: string; mobile: string | null; whatsapp: string | null; email: string | null }[]
  > = {}
  for (const contact of contacts) {
    ;(contactsBySchool[contact.schoolId] ??= []).push({
      id: contact.id,
      fullName: contact.fullName,
      mobile: contact.mobile,
      whatsapp: contact.whatsapp,
      email: contact.email,
    })
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PageHeader
        title="Quick log"
        description="Field entry — pick the school, then capture it."
        breadcrumbs={[{ label: 'Growth CRM', href: '/platform/growth' }, { label: 'Quick log' }]}
      />
      <Card>
        <CardContent className="pt-4">
          <Suspense>
            <GrowthLogWorkbench
              schools={schools}
              operators={operators}
              contactsBySchool={contactsBySchool}
              templates={templates}
              nextMeetingBySchool={nextMeetingBySchool}
              ownerName={`${ctx.user.firstName} ${ctx.user.lastName}`.trim()}
              canSend={canSend}
            />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  )
}
