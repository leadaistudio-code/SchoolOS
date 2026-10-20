import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/page-header'
import { requireContext } from '@/server/context'
import { getGlobalSettings, getSchoolPolicy } from '@/server/modules/tapasya/config'
import { PolicyForm } from './policy-form'

export const metadata = { title: 'Tapasya settings' }

export default async function TapasyaSettingsPage() {
  const ctx = await requireContext()
  if (!ctx.can('tapasya.manage')) redirect('/403')
  const [policy, settings] = await Promise.all([getSchoolPolicy(ctx), getGlobalSettings()])
  return (
    <div>
      <PageHeader title="Tapasya settings" description="Switch Tapasya Mode on for your school and set the timer ranges students and teachers can choose from." />
      <PolicyForm policy={policy} platform={settings.limits} globalBoardOpen={settings.leaderboardEnabled} />
    </div>
  )
}
