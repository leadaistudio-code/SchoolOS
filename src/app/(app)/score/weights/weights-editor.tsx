'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { RotateCcw, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox, Input } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import {
  metricsFor,
  weightShares,
  type MetricDef,
  type ScorePopulation,
  type WeightSetting,
} from '@/lib/score'
import { resetWeightsAction, saveWeightsAction } from '../actions'

/**
 * The weighting editor.
 *
 * Weights are relative, and the editor says so by showing the normalised share
 * live beside every slider. A school typing 30/25/10 sees exactly the same
 * result as one typing 6/5/2, which removes the single most common frustration
 * with weightings — being forced to make the numbers add up to a hundred before
 * the form will accept them.
 *
 * The share is computed with the same `weightShares` the server scores with, so
 * the preview cannot drift from the outcome.
 */
export function WeightsEditor({
  population,
  initial,
  availableMetrics,
}: {
  population: ScorePopulation
  initial: WeightSetting[]
  /** Metric keys this school may use — module-gated ones are absent when off. */
  availableMetrics: string[]
}) {
  const router = useRouter()
  const toast = useToast()

  const [rows, setRows] = React.useState<WeightSetting[]>(initial)
  const [pending, start] = React.useTransition()

  // A save elsewhere, or a module being switched on, changes what the server
  // considers current; adopt it rather than leaving the editor showing a stale
  // set the next save would write back.
  React.useEffect(() => setRows(initial), [initial])

  const catalogue = React.useMemo(
    () => metricsFor(population).filter((m) => availableMetrics.includes(m.key)),
    [population, availableMetrics],
  )

  const shares = React.useMemo(() => weightShares(rows), [rows])
  const anyLive = rows.some((r) => r.isEnabled && r.weight > 0)
  const dirty = React.useMemo(
    () =>
      rows.some((row) => {
        const before = initial.find((i) => i.metric === row.metric)
        return !before || before.weight !== row.weight || before.isEnabled !== row.isEnabled
      }),
    [rows, initial],
  )

  const update = (metric: string, patch: Partial<WeightSetting>) =>
    setRows((prev) => prev.map((r) => (r.metric === metric ? { ...r, ...patch } : r)))

  const save = () =>
    start(async () => {
      const result = await saveWeightsAction({ population, weights: rows })
      toast.push({
        tone: result.ok ? 'success' : 'error',
        title: result.ok ? 'Weighting saved' : 'Could not save',
        description: result.message,
      })
      if (result.ok) router.refresh()
    })

  const reset = () =>
    start(async () => {
      const result = await resetWeightsAction(population)
      toast.push({
        tone: result.ok ? 'success' : 'error',
        title: result.ok ? 'Weighting reset' : 'Could not reset',
        description: result.message,
      })
      if (result.ok && result.data) {
        setRows(result.data)
        router.refresh()
      }
    })

  return (
    <Card>
      <CardHeader>
        <CardTitle>{population === 'STUDENT' ? 'Student score' : 'Staff score'}</CardTitle>
        <Button size="sm" variant="ghost" onClick={reset} loading={pending}>
          <RotateCcw aria-hidden />
          Standard weighting
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        <Notice tone="info">
          These numbers are relative to each other, not percentages — 30/20/10 and 3/2/1 score
          identically. The share each one actually carries is shown as you type.
        </Notice>

        <ul className="divide-y divide-[var(--border)]">
          {catalogue.map((metric) => {
            const row = rows.find((r) => r.metric === metric.key)
            if (!row) return null
            const share = shares.get(metric.key) ?? 0

            return (
              <MetricRow
                key={metric.key}
                metric={metric}
                row={row}
                share={share}
                onChange={(patch) => update(metric.key, patch)}
              />
            )
          })}
        </ul>

        {!anyLive ? (
          <Notice tone="danger" title="Nothing is switched on">
            With every metric off there is no score to compute. Give at least one area a weight
            above zero.
          </Notice>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <Button onClick={save} loading={pending} disabled={!anyLive || !dirty}>
            <Save aria-hidden />
            Save weighting
          </Button>
          <p className="text-xs text-ink-subtle">
            {dirty
              ? 'Every score in this section is recalculated from these the moment you save.'
              : 'Saved. Scores are being computed with this weighting.'}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

function MetricRow({
  metric,
  row,
  share,
  onChange,
}: {
  metric: MetricDef
  row: WeightSetting
  share: number
  onChange: (patch: Partial<WeightSetting>) => void
}) {
  const off = !row.isEnabled || row.weight === 0

  return (
    <li className={cn('py-3', off && 'opacity-60')}>
      <div className="flex flex-wrap items-start gap-3">
        <label className="flex items-center gap-2 pt-1">
          <Checkbox
            checked={row.isEnabled}
            onChange={(e) => onChange({ isEnabled: e.target.checked })}
            aria-label={`Count ${metric.label} towards the score`}
          />
        </label>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">{metric.label}</p>
          <p className="text-xs text-ink-muted">{metric.description}</p>
          {/* Naming the records behind a metric is what makes a disputed score
              checkable instead of a matter of opinion. */}
          <p className="mt-0.5 text-xs text-ink-subtle">{metric.source}</p>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={50}
            step={1}
            value={row.weight}
            disabled={!row.isEnabled}
            onChange={(e) => onChange({ weight: Number(e.target.value) })}
            aria-label={`${metric.label} weight`}
            className="w-32 accent-[var(--brand-500)]"
          />
          <Input
            type="number"
            min={0}
            max={100}
            value={row.weight}
            disabled={!row.isEnabled}
            onChange={(e) => onChange({ weight: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
            aria-label={`${metric.label} weight, typed`}
            className="w-16 text-center"
          />
          <span className="w-14 shrink-0 text-right text-sm tnum font-medium text-ink">
            {off ? '—' : `${share.toFixed(0)}%`}
          </span>
        </div>
      </div>
    </li>
  )
}
