import { requirePlatformContext } from '@/server/context'
import { listTemplates } from '@/server/modules/platform/growth/service'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { CRM_CHANNEL_LABELS, type CrmMessageChannel } from '@/lib/growth-crm'
import { DeleteTemplateButton, SeedTemplatesButton, TemplateForm, ToggleTemplateButton } from './forms'

export const metadata = { title: 'Templates · Growth CRM' }

export default async function GrowthTemplatesPage() {
  const ctx = await requirePlatformContext('platform.crm')
  const templates = await listTemplates(ctx)
  const canComms = ctx.user.permissions.has('platform.crm_comms')

  return (
    <div className="space-y-6">
      <PageHeader
        title="Message templates"
        description="WhatsApp, SMS and email copy for the sales team. School notice templates are not used here."
        breadcrumbs={[{ label: 'Growth CRM', href: '/platform/growth' }, { label: 'Templates' }]}
        actions={canComms ? <SeedTemplatesButton /> : null}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader>
            <CardTitle>Templates · {templates.length}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {templates.length === 0 ? (
              <EmptyState
                title="No templates yet"
                description="Seed the sales defaults or create one from the side form."
              />
            ) : (
              templates.map((t) => (
                <div key={t.id} className="space-y-2 rounded-[var(--radius-sm)] border border-line p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-ink">{t.name}</p>
                    <Badge tone="neutral">{CRM_CHANNEL_LABELS[t.channel as CrmMessageChannel] ?? t.channel}</Badge>
                    <Badge>{t.category}</Badge>
                    <Badge tone={t.isActive ? 'success' : 'neutral'}>{t.isActive ? 'Active' : 'Off'}</Badge>
                  </div>
                  {t.subject ? <p className="text-xs text-ink-muted">{t.subject}</p> : null}
                  <pre className="whitespace-pre-wrap font-sans text-sm text-ink-muted">{t.body}</pre>
                  {canComms ? (
                    <div className="flex gap-2">
                      <ToggleTemplateButton id={t.id} isActive={t.isActive} />
                      <DeleteTemplateButton id={t.id} />
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {canComms ? (
          <Card>
            <CardHeader>
              <CardTitle>New template</CardTitle>
            </CardHeader>
            <CardContent>
              <TemplateForm />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  )
}
