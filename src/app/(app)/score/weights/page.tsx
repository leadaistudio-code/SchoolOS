import { requireContext } from '@/server/context'
import { enabledScoreModules, getWeights } from '@/server/modules/score/weights'
import { PageHeader } from '@/components/page-header'
import { LinkTabs } from '@/components/ui/tabs'
import { Notice } from '@/components/ui/states'
import { BANDS } from '@/lib/score'
import { scoreTabs } from '../tabs'
import { WeightsEditor } from './weights-editor'

export const metadata = { title: 'Score weighting' }

export default async function WeightsPage() {
  const ctx = await requireContext('score.manage')

  const [studentWeights, staffWeights, modules] = await Promise.all([
    getWeights(ctx, 'STUDENT'),
    getWeights(ctx, 'STAFF'),
    enabledScoreModules(ctx),
  ])

  return (
    <div>
      <PageHeader
        title="Score weighting"
        description="What the health score counts, and how much each part of it is worth"
        breadcrumbs={[{ label: 'Health score', href: '/score' }, { label: 'Weighting' }]}
      />

      <LinkTabs label="Health score views" className="mb-3" items={scoreTabs('/score/weights', ctx)} />

      <div className="space-y-4">
        <Notice tone="info" title="How a score is put together">
          Each area is scored out of 100 from records already in the system, then the areas are
          combined using the weights below. An area with nothing recorded is left out and its weight
          is shared across the areas that do have data — so a child with no exam results yet is never
          scored as though they had failed one.
        </Notice>

        {!modules.transport || !modules.library ? (
          <Notice tone="warning">
            {[!modules.transport ? 'Transport' : null, !modules.library ? 'Library' : null]
              .filter(Boolean)
              .join(' and ')}{' '}
            {!modules.transport && !modules.library ? 'are' : 'is'} not part of your plan, so{' '}
            {!modules.transport && !modules.library ? 'those areas are' : 'that area is'} not offered
            here and counts for nothing.
          </Notice>
        ) : null}

        <WeightsEditor
          population="STUDENT"
          initial={studentWeights}
          availableMetrics={studentWeights.map((w) => w.metric)}
        />

        {ctx.can('staff.view') ? (
          <WeightsEditor
            population="STAFF"
            initial={staffWeights}
            availableMetrics={staffWeights.map((w) => w.metric)}
          />
        ) : null}

        <div className="rounded-[var(--radius)] border border-line bg-surface p-4">
          <h2 className="text-base font-semibold text-ink">What the bands mean</h2>
          <ul className="mt-2 space-y-1.5">
            {BANDS.map((band) => (
              <li key={band.band} className="flex flex-wrap items-baseline gap-2 text-sm">
                <span className="font-medium text-ink">{band.label}</span>
                <span className="text-ink-subtle tnum">
                  {band.min === 0 ? 'below 55' : `${band.min} and above`}
                </span>
                <span className="text-ink-muted">— {band.meaning}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
