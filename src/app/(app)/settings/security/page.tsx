import { requireContext } from '@/server/context'
import { getMfaStatus } from '@/server/modules/mfa/service'
import { SettingsPageHeader, SettingsPanelHeader } from '@/components/settings/settings-page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { MfaDisableForm, MfaEnrolForm } from './mfa-forms'

export const metadata = { title: 'Security' }

export default async function SecuritySettingsPage() {
  const ctx = await requireContext('settings.view')
  const status = await getMfaStatus(ctx)

  return (
    <div className="space-y-6">
      <SettingsPageHeader
        title="Security"
        description="Protect your account with a time-based authenticator app (TOTP)."
        icon="Shield"
        tone="success"
      />

      <Card variant="elevated" className="overflow-hidden">
        <SettingsPanelHeader
          title="Two-factor authentication"
          description="Add a second verification step to your sign-in."
          icon="Shield"
          tone={status.enabled ? 'success' : 'warning'}
          actions={
            <Badge tone={status.enabled ? 'success' : 'neutral'}>
              {status.enabled ? 'Enabled' : 'Off'}
            </Badge>
          }
        />
        <CardContent className="space-y-4 p-5 text-sm text-ink-muted">
          <p>
            When enabled, signing in requires your password and a 6-digit code from an app such as
            Google Authenticator or Authy.
          </p>
          {status.enabled ? <MfaDisableForm /> : <MfaEnrolForm />}
        </CardContent>
      </Card>
    </div>
  )
}
