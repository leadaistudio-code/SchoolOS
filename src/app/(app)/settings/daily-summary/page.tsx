import { requireContext } from '@/server/context'
import { getDigestSettings, previewDigest } from '@/server/modules/daily-ops/digest'
import { ColorBanner } from '@/components/dashboard/color-tiles'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DigestForm } from './digest-form'

export const metadata = { title: 'Daily WhatsApp summary' }

export default async function DailySummaryPage() {
  const ctx = await requireContext('settings.manage')
  const [settings, preview] = await Promise.all([getDigestSettings(ctx), previewDigest(ctx)])

  return (
    <div className="space-y-4">
      <ColorBanner
        tone="fees"
        eyebrow="Settings"
        title="Daily WhatsApp summary"
        description="A short morning and evening report for the principal and owner — attendance, cover, collections, dues and anything waiting for approval — without opening the app."
        actions={
          <Badge tone={settings.enabled ? 'success' : 'neutral'} className="bg-white/90">
            {settings.enabled ? 'On' : 'Off — choose recipients to turn on'}
          </Badge>
        }
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card variant="elevated">
          <CardContent className="pt-5">
            <DigestForm config={settings.config} users={settings.users} />
          </CardContent>
        </Card>
        <div className="space-y-4">
          <PreviewCard heading="Morning preview" message={preview.morning} />
          <PreviewCard heading="Evening preview" message={preview.evening} />
        </div>
      </div>
    </div>
  )
}

function PreviewCard({ heading, message }: { heading: string; message: { title: string; body: string } }) {
  return (
    <Card variant="elevated">
      <CardHeader>
        <CardTitle>{heading}</CardTitle>
        <CardDescription>Built from today&apos;s live data.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-[var(--radius)] bg-[#e7fbe6] p-3 text-[13px] leading-relaxed text-[#111b21] shadow-sm dark:bg-[#005c4b] dark:text-[#e9edef]">
          <p className="font-semibold">{message.title}</p>
          <p className="mt-1.5 whitespace-pre-wrap">{message.body}</p>
        </div>
      </CardContent>
    </Card>
  )
}
