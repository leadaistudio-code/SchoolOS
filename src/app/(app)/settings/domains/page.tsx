import { requireContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
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
        <PageHeader
          title="Custom Domains"
          description="Add a custom domain to serve your portal (e.g. erp.yourschool.com)"
        />
        <Card className="mt-8">
          <CardContent className="py-8 text-sm text-ink-muted">
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
      <PageHeader
        title="Custom Domains"
        description="Add a custom domain to serve your portal (e.g. erp.yourschool.com). After DNS verification, use Check TLS to confirm HTTPS is live on the host."
      />
      <div className="mt-8">
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
