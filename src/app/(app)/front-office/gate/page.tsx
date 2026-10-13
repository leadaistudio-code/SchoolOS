import { requireContext } from '@/server/context'
import { ColorBanner } from '@/components/dashboard/color-tiles'
import { Card, CardContent } from '@/components/ui/card'
import { GateScanner } from './gate-scanner'

export const metadata = { title: 'Gate scan' }

export default async function GatePage() {
  await requireContext('frontoffice.gate')
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <ColorBanner
        tone="transport"
        eyebrow="Gate"
        title="Check a student out"
        description="Scan the QR on the gate pass (a USB scanner types straight into the box) or enter the pass number. Parents are messaged when you let the student out."
      />
      <Card variant="elevated">
        <CardContent className="pt-5">
          <GateScanner />
        </CardContent>
      </Card>
    </div>
  )
}
