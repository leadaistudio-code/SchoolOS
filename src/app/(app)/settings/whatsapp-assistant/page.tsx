import Link from 'next/link'
import { requireContext } from '@/server/context'
import { getAssistantSettings } from '@/server/modules/whatsapp-bot/service'
import { ColorBanner } from '@/components/dashboard/color-tiles'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Notice } from '@/components/ui/states'
import { env } from '@/lib/env'
import { menuText } from '@/lib/whatsapp-bot'
import { AssistantForm } from './assistant-form'

export const metadata = { title: 'WhatsApp assistant' }

export default async function WhatsAppAssistantPage() {
  const ctx = await requireContext('settings.manage')
  const { config, open, total } = await getAssistantSettings(ctx)
  const ready = env().WHATSAPP_DRIVER !== 'log' && !!env().WHATSAPP_INBOUND_SECRET

  return (
    <div className="space-y-4">
      <ColorBanner
        tone="parents"
        eyebrow="Settings"
        title="WhatsApp parent assistant"
        description="Parents message the school's WhatsApp number and get instant answers from live data. Anything else goes to the office inbox as a ticket."
        actions={
          <Badge tone={config.enabled ? 'success' : 'neutral'} className="bg-white/90">
            {config.enabled ? 'On' : 'Off'}
          </Badge>
        }
      />
      {!ready ? (
        <Notice tone="warning">
          WhatsApp receiving is not connected for this installation yet. Ask MyCampusView support to finish the WhatsApp setup; you can
          switch the assistant on once it is ready.
        </Notice>
      ) : null}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card variant="elevated">
          <CardContent className="space-y-5 pt-5">
            <AssistantForm config={config} ready={ready} />
            <p className="text-sm text-ink-muted">
              {total === 0 ? 'No parent messages yet.' : `${open} of ${total} parent messages are waiting for a reply.`}{' '}
              <Link href="/front-office/parent-queries" className="font-medium text-brand underline-offset-2 hover:underline">
                Open the inbox
              </Link>
            </p>
          </CardContent>
        </Card>
        <Card variant="elevated">
          <CardHeader>
            <CardTitle>What parents see</CardTitle>
            <CardDescription>After they send &ldquo;hi&rdquo;.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-[var(--radius)] bg-[#e7fbe6] p-3 text-[13px] leading-relaxed text-[#111b21] shadow-sm whitespace-pre-wrap dark:bg-[#005c4b] dark:text-[#e9edef]">
              {config.greeting ? `${config.greeting}\n\n` : ''}
              {menuText(ctx.tenant.name, 'Aarav Sharma', true)}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
