import { requireContext } from '@/server/context'
import { getSmtpSettings } from '@/server/mail/smtp'
import { PageHeader } from '@/components/page-header'
import { MailForm } from './mail-form'

export const metadata = { title: 'Email' }

export default async function EmailSettingsPage() {
  const ctx = await requireContext('settings.manage')
  const settings = await getSmtpSettings(ctx.tenant.id)

  return (
    <div>
      <PageHeader
        title="Email"
        description="Connect the school's own mailbox so outgoing mail comes from your address"
        breadcrumbs={[{ label: 'Settings', href: '/settings' }, { label: 'Email' }]}
      />
      <MailForm settings={settings} testRecipient={ctx.user.email ?? ''} />
    </div>
  )
}
