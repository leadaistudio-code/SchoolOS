import { requirePlatformContext } from '@/server/context'
import { listOperators } from '@/server/modules/platform/growth/service'
import { listRecipients } from '@/server/modules/platform/growth/reminders'
import { CRM_WA_TEMPLATES } from '@/lib/growth-reminders'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { RecipientActions, RecipientForm, type OperatorOption } from './forms'

export const metadata = { title: 'Reminders · Growth CRM' }

export default async function GrowthRemindersPage() {
  const ctx = await requirePlatformContext('platform.crm')
  const [recipients, users] = await Promise.all([listRecipients(ctx), listOperators(ctx)])
  const canEdit = ctx.user.permissions.has('platform.crm_comms')
  const operators: OperatorOption[] = users.map((u) => ({
    id: u.id,
    label: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || u.id,
  }))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales reminders"
        description="Daily WhatsApp plan at 08:30 AM, wrap-up at 6:00 PM and a heads-up before every meeting. Only the people listed here get them."
        breadcrumbs={[{ label: 'Growth CRM', href: '/platform/growth' }, { label: 'Reminders' }]}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader>
            <CardTitle>Salespeople · {recipients.length}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recipients.length === 0 ? (
              <EmptyState
                title="Nobody gets reminders yet"
                description="Add each salesperson with their WhatsApp number from the side form."
              />
            ) : (
              recipients.map((r) => (
                <div key={r.id} className="space-y-3 rounded-[var(--radius-sm)] border border-line p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-ink">{r.name}</p>
                    <Badge tone={r.isActive ? 'success' : 'neutral'}>{r.isActive ? 'Active' : 'Paused'}</Badge>
                    <Badge tone="neutral">{r.scope === 'MINE' ? 'Own follow-ups' : 'Whole team'}</Badge>
                  </div>
                  <p className="text-xs text-ink-muted">
                    {[
                      r.whatsapp ? `WhatsApp ${r.whatsapp}` : null,
                      r.email,
                      r.user ? `CRM login: ${[r.user.firstName, r.user.lastName].filter(Boolean).join(' ')}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  <p className="text-xs text-ink-subtle">
                    {[r.morning ? 'Morning plan' : null, r.evening ? 'Wrap-up' : null, r.meetings ? 'Meeting alerts' : null]
                      .filter(Boolean)
                      .join(' · ') || 'No reminders selected'}
                  </p>
                  {canEdit ? <RecipientActions recipient={r} isActive={r.isActive} operators={operators} /> : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          {canEdit ? (
            <Card>
              <CardHeader>
                <CardTitle>Add salesperson</CardTitle>
              </CardHeader>
              <CardContent>
                <RecipientForm operators={operators} />
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle>WhatsApp templates</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-ink-muted">
              <p>These must be approved in Meta WhatsApp Manager (category Utility, language English) before WhatsApp reminders go out. Email still works without them.</p>
              <ul className="space-y-1 font-mono text-xs text-ink">
                {Object.values(CRM_WA_TEMPLATES).map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
              <p>Any message a salesperson sends to the business number, including the “Show my list” button, is answered with their pending list.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
