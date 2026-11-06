import { requirePlatformContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { assistantConfigured } from '@/server/assistant/providers'
import { whisperSttConfigured } from '@/server/assistant/speech/voices'
import { CaptureWorkspace } from './capture-workspace'

export const metadata = { title: 'Capture visit · Growth CRM' }

export default async function GrowthCapturePage({
  searchParams,
}: {
  searchParams: Promise<{ voice?: string }>
}) {
  await requirePlatformContext('platform.crm_create')
  const { voice } = await searchParams
  const voiceEnabled = assistantConfigured() && whisperSttConfigured()

  return (
    <div className="mx-auto max-w-lg space-y-4 pb-8">
      <PageHeader
        title="Capture a school visit"
        description={
          voiceEnabled
            ? 'Speak about the visit in Hindi or English; the form fills itself. Check it and confirm.'
            : 'Fill this before you leave the school: who you met, photos, what was said and when to follow up.'
        }
        breadcrumbs={[{ label: 'Growth CRM', href: '/platform/growth' }, { label: 'Capture visit' }]}
      />
      <CaptureWorkspace voiceEnabled={voiceEnabled} autoStart={voiceEnabled && voice === '1'} />
    </div>
  )
}
