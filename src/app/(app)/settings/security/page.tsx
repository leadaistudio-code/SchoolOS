import { requireContext } from '@/server/context'
import { getMfaStatus } from '@/server/modules/mfa/service'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { MfaDisableForm, MfaEnrolForm } from './mfa-forms'

export const metadata = { title: 'Security' }

export default async function SecuritySettingsPage() {
  const ctx = await requireContext('settings.view')
  const status = await getMfaStatus(ctx)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Security"
        description="Protect your account with a time-based authenticator app (TOTP)."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Two-factor authentication
            <Badge tone={status.enabled ? 'success' : 'neutral'}>
              {status.enabled ? 'Enabled' : 'Off'}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-ink-muted">
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
