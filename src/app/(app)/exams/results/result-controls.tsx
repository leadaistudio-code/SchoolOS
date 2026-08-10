'use client'

import { useState, useTransition } from 'react'
import { Calculator, Send } from 'lucide-react'
import {
  computeResultsAction,
  publishResultsAction,
  setExamGradingScaleAction,
} from '../actions'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select } from '@/components/ui/input'

/**
 * Result workflow bar.
 *
 * Publishing is irreversible for parents, so the two steps stay explicit and
 * in order: choose a scale, calculate, then publish.
 */
export function ResultControls({
  examId,
  gradingScaleId,
  scales,
  canCompute,
  canPublish,
  published,
}: {
  examId: string
  gradingScaleId: string | null
  scales: { id: string; name: string }[]
  canCompute: boolean
  canPublish: boolean
  published: boolean
}) {
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const run = (action: (id: string) => Promise<{ ok: boolean; message: string }>) =>
    startTransition(async () => setMessage((await action(examId)).message))

  return (
    <Card className="flex flex-wrap items-center gap-3 px-3 py-2.5">
      {canCompute && !published ? (
        <Select
          aria-label="Grading scale"
          value={gradingScaleId ?? ''}
          onChange={(event) => run(() => setExamGradingScaleAction(examId, event.target.value))}
          className="w-52"
        >
          <option value="">Choose grading scale</option>
          {scales.map((scale) => (
            <option key={scale.id} value={scale.id}>
              {scale.name}
            </option>
          ))}
        </Select>
      ) : null}

      <p role="status" className="text-sm text-ink-muted min-w-0">
        {message ??
          (published ? 'Published to students and parents.' : 'Calculate rankings, then publish.')}
      </p>

      <div className="flex gap-2 ml-auto">
        {canCompute && !published ? (
          <Button variant="secondary" onClick={() => run(computeResultsAction)} loading={pending}>
            <Calculator aria-hidden />
            Calculate rankings
          </Button>
        ) : null}
        {canPublish && !published ? (
          <Button onClick={() => run(publishResultsAction)} loading={pending}>
            <Send aria-hidden />
            Publish results
          </Button>
        ) : null}
      </div>
    </Card>
  )
}
