'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { saveAppraisalAction } from './actions'

export type Competency = { key: string; label: string }

const STAGES = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SELF_REVIEW', label: 'With the appraisee' },
  { value: 'MANAGER_REVIEW', label: 'With the reviewer' },
  { value: 'COMPLETED', label: 'Completed' },
]

const OUTCOMES = [
  { value: '', label: 'Not decided' },
  { value: 'SUSTAIN', label: 'Sustain' },
  { value: 'INCREMENT', label: 'Increment' },
  { value: 'PROMOTION', label: 'Promotion' },
  { value: 'IMPROVEMENT_PLAN', label: 'Improvement plan' },
]

/**
 * The appraisal itself.
 *
 * The overall score is computed from the competency ratings and shown live
 * rather than typed: a headline that can disagree with the detail beneath it
 * is the first thing an appraisee will challenge, and rightly.
 *
 * Self-assessment and the reviewer's assessment are separate boxes because
 * the whole point is that the two can differ and both stay on the record.
 */
export function AppraisalEditor({
  appraisal,
  competencies,
  trigger = 'Open review',
}: {
  appraisal: {
    id: string
    status: string
    selfComment: string | null
    reviewerComment: string | null
    strengths: string | null
    improvements: string | null
    goals: string | null
    outcome: string | null
    incrementMinor: number | null
    staffName: string
    cycleName: string
    ratings: { competency: string; rating: number; comment: string | null }[]
  }
  competencies: Competency[]
  trigger?: string
}) {
  const toast = useToast()
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()

  const initial = React.useMemo(
    () => new Map(appraisal.ratings.map((r) => [r.competency, r.rating])),
    [appraisal.ratings],
  )
  const [ratings, setRatings] = React.useState<Map<string, number>>(initial)
  const [status, setStatus] = React.useState(appraisal.status)
  const [selfComment, setSelfComment] = React.useState(appraisal.selfComment ?? '')
  const [reviewerComment, setReviewerComment] = React.useState(appraisal.reviewerComment ?? '')
  const [strengths, setStrengths] = React.useState(appraisal.strengths ?? '')
  const [improvements, setImprovements] = React.useState(appraisal.improvements ?? '')
  const [goals, setGoals] = React.useState(appraisal.goals ?? '')
  const [outcome, setOutcome] = React.useState(appraisal.outcome ?? '')
  const [increment, setIncrement] = React.useState(
    appraisal.incrementMinor ? String(appraisal.incrementMinor / 100) : '',
  )

  const scored = [...ratings.values()].filter((v) => v > 0)
  const overall = scored.length
    ? Math.round((scored.reduce((a, b) => a + b, 0) / scored.length) * 10) / 10
    : null

  const submit = () =>
    startTransition(async () => {
      const result = await saveAppraisalAction({
        id: appraisal.id,
        status,
        selfComment: selfComment.trim() || undefined,
        reviewerComment: reviewerComment.trim() || undefined,
        strengths: strengths.trim() || undefined,
        improvements: improvements.trim() || undefined,
        goals: goals.trim() || undefined,
        outcome: outcome || undefined,
        increment: increment ? Number(increment) : undefined,
        ratings: competencies
          .filter((c) => (ratings.get(c.key) ?? 0) > 0)
          .map((c) => ({ competency: c.key, rating: ratings.get(c.key)! })),
      })
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Could not save', description: result.message })
        return
      }
      toast.push({ tone: 'success', title: 'Appraisal saved', description: result.message })
      setOpen(false)
    })

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        {trigger}
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        size="lg"
        title={`${appraisal.cycleName} · ${appraisal.staffName}`}
        description="Score each competency out of five. The overall rating is their mean."
        footer={
          <>
            <Button onClick={submit} loading={pending}>
              Save
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <span className="ml-auto text-sm text-ink-muted">
              Overall{' '}
              <span className="text-base font-semibold tnum text-ink">{overall ?? '—'}</span>
              <span className="text-xs text-ink-subtle"> / 5</span>
            </span>
          </>
        }
      >
        <div className="space-y-4">
          <ul className="divide-y divide-[var(--border)] rounded-[var(--radius-sm)] border border-line">
            {competencies.map((c) => {
              const value = ratings.get(c.key) ?? 0
              return (
                <li key={c.key} className="flex flex-wrap items-center gap-3 px-3 py-2">
                  <span className="min-w-0 flex-1 text-sm text-ink">{c.label}</span>
                  <div className="flex items-center gap-1" role="group" aria-label={c.label}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        aria-pressed={value === n}
                        onClick={() =>
                          setRatings((current) => {
                            const next = new Map(current)
                            // Clicking the current score clears it, so a
                            // competency can be left unscored.
                            if (next.get(c.key) === n) next.delete(c.key)
                            else next.set(c.key, n)
                            return next
                          })
                        }
                        className={cn(
                          'size-7 rounded-[var(--radius-sm)] border text-xs font-medium tnum transition-colors',
                          value === n
                            ? 'border-[var(--brand-500)] bg-[var(--brand-500)] text-[var(--brand-contrast)]'
                            : 'border-line text-ink-muted hover:bg-surface-2',
                        )}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </li>
              )
            })}
          </ul>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Stage" htmlFor="ap-status">
              <Select id="ap-status" value={status} onChange={(e) => setStatus(e.target.value)}>
                {STAGES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Outcome" htmlFor="ap-outcome">
              <Select id="ap-outcome" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
                {OUTCOMES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>

            {outcome === 'INCREMENT' || outcome === 'PROMOTION' ? (
              <Field
                label="Increment"
                htmlFor="ap-increment"
                className="sm:col-span-2"
                hint="Monthly, in rupees. Recorded here; apply it on the Salary tab."
              >
                <Input
                  id="ap-increment"
                  type="number"
                  min="0"
                  value={increment}
                  onChange={(e) => setIncrement(e.target.value)}
                />
              </Field>
            ) : null}

            <Field label="Self-assessment" htmlFor="ap-self" className="sm:col-span-2">
              <Textarea
                id="ap-self"
                value={selfComment}
                onChange={(e) => setSelfComment(e.target.value)}
                placeholder="What the appraisee says about their own year"
              />
            </Field>
            <Field label="Reviewer's assessment" htmlFor="ap-rev" className="sm:col-span-2">
              <Textarea
                id="ap-rev"
                value={reviewerComment}
                onChange={(e) => setReviewerComment(e.target.value)}
              />
            </Field>
            <Field label="Strengths" htmlFor="ap-str">
              <Textarea
                id="ap-str"
                value={strengths}
                onChange={(e) => setStrengths(e.target.value)}
              />
            </Field>
            <Field label="Areas to improve" htmlFor="ap-imp">
              <Textarea
                id="ap-imp"
                value={improvements}
                onChange={(e) => setImprovements(e.target.value)}
              />
            </Field>
            <Field
              label="Goals for next cycle"
              htmlFor="ap-goals"
              className="sm:col-span-2"
              hint="What next year's appraisal will be measured against"
            >
              <Textarea id="ap-goals" value={goals} onChange={(e) => setGoals(e.target.value)} />
            </Field>
          </div>
        </div>
      </Dialog>
    </>
  )
}
