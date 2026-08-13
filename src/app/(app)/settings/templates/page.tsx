import { requireContext } from '@/server/context'
import { listNotificationTemplates } from '@/server/modules/notification-templates/service'
import { TEMPLATE_EVENTS } from '@/lib/notification-templates'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
      <PageHeader
        title="Message templates"
        description="Email, SMS and push copy for school notifications. Variables are replaced at send time."
        actions={<SeedTemplatesButton />}
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
                description="Seed defaults or create one from the side form."
              />
            ) : (
              templates.map((t) => (
                <div key={t.id} className="rounded-[var(--radius-sm)] border border-line p-3 space-y-2">
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

        <Card>
          <CardHeader>
            <CardTitle>Create / update</CardTitle>
          </CardHeader>
          <CardContent>
            <TemplateForm />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
