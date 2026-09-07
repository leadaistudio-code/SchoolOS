import { requireContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { BiometricConsole } from './biometric-console'

export const metadata = { title: 'Biometric / MyCampusView Connect' }

export default async function BiometricSettingsPage() {
  const ctx = await requireContext('biometric.view')

  return (
    <div>
      <PageHeader
        title="Biometric"
        description="Connect school fingerprint / RFID devices through MyCampusView Connect. Hardware stays on the school LAN; only outbound HTTPS reaches the cloud."
        breadcrumbs={[{ label: 'Settings', href: '/settings' }, { label: 'Biometric' }]}
      />
      <BiometricConsole canManage={ctx.can('biometric.manage')} />
    </div>
  )
}
