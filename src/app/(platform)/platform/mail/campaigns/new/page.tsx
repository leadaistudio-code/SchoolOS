import { PageHeader } from '@/components/page-header'
import { canManageMailboxes, listDocuments, listMailboxes } from '@/server/modules/platform/mail/service'
import { MailTabs, requireMailContext } from '../../tabs'
import { CampaignWizard } from './campaign-wizard'

export const metadata = { title: 'New bulk email · Mail' }

export default async function NewCampaignPage() {
  const ctx = await requireMailContext()
  const [mailboxes, documents] = await Promise.all([listMailboxes(ctx), listDocuments(ctx)])

  return (
    <div className="space-y-5">
      <PageHeader
        title="New bulk email"
        description="Each school receives its own copy, addressed to it by name. Nobody sees anyone else's address."
        breadcrumbs={[
          { label: 'Mail', href: '/platform/mail/inbox' },
          { label: 'Bulk email', href: '/platform/mail/campaigns' },
          { label: 'New' },
        ]}
      />
      <MailTabs current="campaigns" showSettings={canManageMailboxes(ctx)} />
      <CampaignWizard
        mailboxes={mailboxes.map((m) => ({
          id: m.id,
          fromName: m.fromName,
          fromEmail: m.fromEmail,
          isDefault: m.isDefault,
          verifiedAt: m.verifiedAt,
        }))}
        documents={documents.map((d) => ({ id: d.id, title: d.title, sizeBytes: d.sizeBytes }))}
      />
    </div>
  )
}
