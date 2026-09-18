import { requireContext } from '@/server/context'
import { SettingsPageHeader } from '@/components/settings/settings-page-header'
import { BiometricConsole } from './biometric-console'

export const metadata = { title: 'Biometric / MyCampusView Connect' }

export default async function BiometricSettingsPage() {
  const ctx = await requireContext('biometric.view')

  return (
    <div>
      <SettingsPageHeader
        title="Biometric attendance"
        description="Monitor devices, map users and review attendance punches from one place."
        icon="Fingerprint"
      />
      <BiometricConsole canManage={ctx.can('biometric.manage')} />
    </div>
  )
}
