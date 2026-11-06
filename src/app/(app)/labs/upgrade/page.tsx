import { redirect } from 'next/navigation'
import { ClipboardCheck, FlaskConical, ShieldCheck } from 'lucide-react'
import { requireContext } from '@/server/context'
import { FEATURE, hasFeature } from '@/server/entitlements'
import { ColorBanner } from '@/components/dashboard/color-tiles'
import { Card, CardContent } from '@/components/ui/card'

export const metadata = { title: 'Labs add-on' }

const POINTS = [
  {
    icon: FlaskConical,
    title: 'Registers, ready on day one',
    body: 'The CBSE Composite Science Lab SOP list and the Atal Tinkering Lab kit list for Robotics & AI, with live stock, shortfall and a printable register.',
  },
  {
    icon: ClipboardCheck,
    title: 'Practicals that run themselves',
    body: 'Book the lab without clashes, mark who attended, deduct consumables automatically and keep each student’s practical record.',
  },
  {
    icon: ShieldCheck,
    title: 'Safety and inspection evidence',
    body: 'Scheduled inspections, incident register with principal alerts, chemical and e-waste logs and a readiness score for inspection visits.',
  },
]

export default async function LabsUpgradePage() {
  const ctx = await requireContext()
  if (await hasFeature(ctx.tenant.id, FEATURE.MODULE_SCIENCE_LAB)) redirect('/labs')

  return (
    <div className="space-y-4">
      <ColorBanner
        tone="attendance"
        eyebrow="Add-on"
        title="Science and Robotics & AI Labs"
        description="This add-on is not active for your school yet. Ask your MyCampusView account manager to switch it on."
      />
      <div className="grid gap-3 md:grid-cols-3">
        {POINTS.map(({ icon: Icon, title, body }) => (
          <Card key={title} variant="elevated">
            <CardContent className="space-y-2 pt-5">
              <Icon className="size-5 text-[var(--brand-600)]" aria-hidden />
              <p className="text-sm font-semibold text-ink">{title}</p>
              <p className="text-sm text-ink-muted">{body}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
