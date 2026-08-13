import Link from 'next/link'
import { requireContext } from '@/server/context'
import { listCredentials, providerStatus } from '@/server/modules/settings/integrations'
import { PageHeader } from '@/components/page-header'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Notice } from '@/components/ui/states'
import { CredentialForm } from './credential-form'

export const metadata = { title: 'Integrations' }

const COPY: Record<string, { title: string; blurb: string; keyLabel: string; secretLabel: string; accountLabel: string; senderLabel?: string }> = {
  sms: {
    title: 'SMS',
    blurb: 'The account this school holds with its SMS vendor. Used for fee reminders and absence alerts.',
    accountLabel: 'Account or sender ID',
    keyLabel: 'API key',
    secretLabel: 'API secret',
    senderLabel: 'Sender ID shown to parents',
  },
  whatsapp: {
    title: 'WhatsApp',
    blurb: 'Business account credentials for template messages.',
    accountLabel: 'Business account ID',
    keyLabel: 'Access token',
    secretLabel: 'App secret',
    senderLabel: 'Sending number',
  },
  payment: {
    title: 'Payment gateway',
    blurb: 'Collects online fee payments into this school’s own settlement account.',
    accountLabel: 'Merchant or account ID',
    keyLabel: 'Key ID',
    secretLabel: 'Key secret',
  },
}

/**
 * Integrations.
 *
 * Two things live here and the page keeps them plainly apart. What the
 * deployment is wired to is read from the environment and shown read-only — a
 * school cannot switch the product's SMS vendor, and pretending otherwise
 * would be a control that does nothing. What a school *can* set is its own
 * account with that vendor, below.
 */
export default async function IntegrationsPage() {
  const ctx = await requireContext('settings.integrations')
  const [providers, credentials] = await Promise.all([providerStatus(ctx), listCredentials(ctx)])

  const simulated = providers.filter((p) => !p.live)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Integrations"
        description="What this deployment is connected to, and the accounts this school uses."
        breadcrumbs={[{ label: 'Settings', href: '/settings' }, { label: 'Integrations' }]}
      />

      {simulated.length > 0 ? (
        <Notice tone="info" title={`${simulated.length} services are not live`}>
          {simulated.map((p) => p.label).join(', ')} are running in their development mode. Nothing
          is actually sent or charged until the deployment is configured for them.
        </Notice>
      ) : null}

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Connected services</CardTitle>
          <span className="text-xs text-ink-subtle">Set by whoever runs this deployment</span>
        </CardHeader>
        <ul className="divide-y divide-[var(--border)]">
          {providers.map((provider) => (
            <li
              key={provider.key}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="text-base font-medium text-ink">{provider.label}</span>
                  <Badge tone={provider.live ? 'success' : 'neutral'}>
                    {provider.live ? 'live' : 'not live'}
                  </Badge>
                  <span className="text-xs tnum text-ink-subtle">{provider.driver}</span>
                </span>
                <span className="mt-0.5 block text-sm text-ink-muted">{provider.detail}</span>
              </span>
              {provider.href ? (
                <Link
                  href={provider.href}
                  className="shrink-0 text-sm font-medium text-[var(--brand-600)] hover:underline"
                >
                  Configure
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>This school&apos;s accounts</CardTitle>
          <span className="text-xs text-ink-subtle">
            Stored encrypted — never shown again after saving
          </span>
        </CardHeader>
        <div className="divide-y divide-[var(--border)]">
          {credentials.map((credential) => (
            <CredentialForm
              key={credential.kind}
              credential={credential}
              copy={COPY[credential.kind]!}
            />
          ))}
        </div>
      </Card>
    </div>
  )
}
