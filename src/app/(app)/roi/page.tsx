import { requireContext } from '@/server/context'
import { formatDay } from '@/lib/dates'
import { buildRoiSeed } from '@/server/modules/roi/service'
import { PageHeader } from '@/components/page-header'
import { RoiCalculator } from './roi-calculator'

export const metadata = { title: 'ROI calculator' }

/**
 * The ROI calculator.
 *
 * Behind `roi.view`, which only School Admin and Principal hold: this is
 * commercial modelling with salary figures in it, not an operational screen,
 * and a class teacher has no business being able to open it.
 *
 * The seed is built server-side from the school's own records so the form
 * opens with facts rather than an empty grid — the conversation then starts at
 * "is this right?" instead of "how many students do you have?".
 */
export default async function RoiPage() {
  const ctx = await requireContext('roi.view')
  const seed = await buildRoiSeed(ctx)

  return (
    <div>
      <PageHeader
        title="ROI calculator"
        description="What MyCampusView is worth to this school every month, from your own numbers and stated assumptions"
      />

      <RoiCalculator
        initialInputs={seed.inputs}
        seeded={seed.seeded}
        gaps={seed.gaps}
        schoolName={ctx.tenant.name}
        generatedOn={formatDay(new Date())}
      />
    </div>
  )
}
