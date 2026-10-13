import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requireContext } from '@/server/context'
import { generatorData } from '@/server/modules/timetable/generator'
import { ColorBanner } from '@/components/dashboard/color-tiles'
import { buttonVariants } from '@/components/ui/button-variants'
import { Notice } from '@/components/ui/states'
import { TimetableGenerator } from './generator'

export const metadata = { title: 'Timetable generator' }

export default async function TimetableGeneratorPage() {
  const ctx = await requireContext('timetable.manage')
  const data = await generatorData(ctx)
  const teaching = data.periods.filter((p) => !p.isBreak).length

  return (
    <div className="space-y-4">
      <ColorBanner
        tone="staff"
        eyebrow="Academics"
        title="Timetable generator"
        description="Set how many lessons each subject needs and any teacher limits, then let the generator build a week with no teacher double-booked."
        actions={
          <Link href="/academics/timetable" className={buttonVariants({ variant: 'secondary' })}>
            <ArrowLeft className="size-4" aria-hidden /> Timetable
          </Link>
        }
      />
      {teaching === 0 ? (
        <Notice tone="warning">
          The school day has no lesson periods yet. Add them on the{' '}
          <Link href="/academics/timetable" className="underline">
            timetable page
          </Link>{' '}
          first.
        </Notice>
      ) : (
        <TimetableGenerator data={data} />
      )}
    </div>
  )
}
