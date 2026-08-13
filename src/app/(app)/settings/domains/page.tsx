import { requireContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { DomainManager } from './domain-manager'
import { listDomains } from '@/server/modules/domains/service'

export const metadata = { title: 'Custom Domains' }

export default async function DomainsPage() {
  const ctx = await requireContext('settings.manage')
  const domains = await listDomains(ctx)

  return (
    <div>
      <PageHeader
        title="Custom Domains"
        description="Add a custom domain to serve your portal (e.g. erp.yourschool.com)"
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
