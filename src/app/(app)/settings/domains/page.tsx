import { requireContext } from '@/server/context'
import { SettingsPageHeader } from '@/components/settings/settings-page-header'
import { DomainManager } from './domain-manager'
import { listDomains } from '@/server/modules/domains/service'
import { hasFeature } from '@/server/entitlements'
import { FEATURE } from '@/lib/features'
import { Card, CardContent } from '@/components/ui/card'

export const metadata = { title: 'Custom Domains' }

export default async function DomainsPage() {
  const ctx = await requireContext('settings.manage')
  const allowed = await hasFeature(ctx.tenant.id, FEATURE.MODULE_CUSTOM_DOMAIN)

  if (!allowed) {
    return (
      <div>
        <SettingsPageHeader
          title="Custom Domains"
          description="Add a custom domain to serve your portal (e.g. erp.yourschool.com)"
          icon="Globe"
          tone="info"
        />
        <Card variant="elevated" className="mt-6 overflow-hidden">
          <CardContent className="bg-info-bg px-5 py-8 text-sm text-info">
            Custom domains are not included in this school&apos;s plan. Upgrade to Pro or
            Enterprise, or ask the platform team to enable <code>module.custom_domain</code>.
          </CardContent>
        </Card>
      </div>
    )
  }

  const domains = await listDomains(ctx)

  return (
    <div>
      <SettingsPageHeader
        title="Custom Domains"
        description="Add a custom domain to serve your portal (e.g. erp.yourschool.com). After DNS verification, use Check TLS to confirm HTTPS is live on the host."
        icon="Globe"
        tone="info"
      />
      <div className="mt-6">
        <DomainManager
          initialDomains={domains.map((domain) => ({
            ...domain,
            createdAt: domain.createdAt.toISOString(),
          }))}
        />
      </div>
    </div>
  )
}
