import { requireContext } from '@/server/context'
import { listNotificationTemplates } from '@/server/modules/notification-templates/service'
import { TEMPLATE_EVENTS } from '@/lib/notification-templates'
import { SettingsPageHeader, SettingsPanelHeader } from '@/components/settings/settings-page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { DeleteTemplateButton, SeedTemplatesButton, TemplateForm } from './forms'

export const metadata = { title: 'Message templates' }

export default async function TemplatesPage() {
  const ctx = await requireContext('settings.manage')
  const templates = await listNotificationTemplates(ctx)
  const labels = new Map<string, string>(TEMPLATE_EVENTS.map((e) => [e.key, e.label]))

  return (
    <div className="space-y-6">
      <SettingsPageHeader
        title="Message templates"
        description="Email, SMS and push copy for school notifications. Variables are replaced at send time."
        actions={<SeedTemplatesButton />}
        icon="Mail"
        tone="warning"
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card variant="elevated" className="overflow-hidden">
          <SettingsPanelHeader
            title={`Templates · ${templates.length}`}
            description="Reusable messages grouped by event and channel."
            icon="Mail"
            tone="warning"
          />
          <CardContent className="space-y-3 p-5">
            {templates.length === 0 ? (
              <EmptyState
                title="No templates yet"
                description="Seed defaults or create one from the side form."
              />
            ) : (
              templates.map((t) => (
                <div key={t.id} className="space-y-2 rounded-[var(--radius-sm)] bg-surface-2 p-3.5 transition-colors hover:bg-surface-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-ink">
                      {labels.get(t.eventKey) ?? t.eventKey}
                    </p>
                    <Badge tone="neutral">{t.channel}</Badge>
                    <Badge tone={t.isActive ? 'success' : 'neutral'}>
                      {t.isActive ? 'Active' : 'Off'}
                    </Badge>
                    {!t.tenantId ? <Badge tone="brand">Built-in</Badge> : null}
                  </div>
                  {t.subject ? <p className="text-xs text-ink-muted">{t.subject}</p> : null}
                  <pre className="whitespace-pre-wrap font-sans text-sm text-ink-muted">{t.body}</pre>
                  {t.tenantId ? <DeleteTemplateButton id={t.id} /> : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card variant="elevated" className="h-fit overflow-hidden">
          <SettingsPanelHeader
            title="Create or update"
            description="Configure content for one event channel."
            icon="Mail"
            tone="brand"
          />
          <CardContent className="p-5">
            <TemplateForm />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
