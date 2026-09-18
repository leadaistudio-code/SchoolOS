import { requireContext } from '@/server/context'
import { getSmtpSettings } from '@/server/mail/smtp'
import { SettingsPageHeader } from '@/components/settings/settings-page-header'
import { MailForm } from './mail-form'

export const metadata = { title: 'Email' }

export default async function EmailSettingsPage() {
  const ctx = await requireContext('settings.manage')
  const settings = await getSmtpSettings(ctx.tenant.id)

  return (
    <div>
      <SettingsPageHeader
        title="Email"
        description="Connect the school's own mailbox so outgoing mail comes from your address"
        icon="AtSign"
        tone="info"
      />
      <MailForm settings={settings} testRecipient={ctx.user.email ?? ''} />
    </div>
  )
}
