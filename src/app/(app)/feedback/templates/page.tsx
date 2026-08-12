import { requireContext } from '@/server/context'
import { ensureDefaultTemplate, listTemplates } from '@/server/modules/feedback/service'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
export const metadata = { title: 'Feedback templates' }
export default async function TemplatesPage() { const ctx = await requireContext('feedback.template_manage'); await ensureDefaultTemplate(ctx); const templates = await listTemplates(ctx); return <div className="space-y-4"><PageHeader title="Feedback templates" description="Reusable, age-appropriate forms with privacy rules built in." />{templates.length === 0 ? <Card><EmptyState title="No templates yet" description="Start with the student teacher feedback template." /></Card> : <div className="grid gap-3 lg:grid-cols-2">{templates.map((template) => <Card key={template.id} className="p-5"><div className="flex justify-between gap-3"><div><h2 className="text-base font-semibold text-ink">{template.name}</h2><p className="mt-1 text-sm text-ink-muted">{template._count.questions} questions · {template.audience.toLowerCase()} to {template.target.toLowerCase()}</p></div><Badge tone={template.isActive ? 'success' : 'neutral'}>{template.isActive ? 'active' : 'inactive'}</Badge></div><p className="mt-4 text-xs text-ink-subtle">{template.isAnonymousToTarget ? `Anonymous to target · ${template.minimumResponses} response threshold` : 'Identified responses'}</p></Card>)}</div>}</div> }
