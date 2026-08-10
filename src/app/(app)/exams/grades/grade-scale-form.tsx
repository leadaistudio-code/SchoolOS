'use client'

import { useActionState } from 'react'
import { Save } from 'lucide-react'
import { createGradingScaleAction } from '../actions'
import { emptyFormState } from '@/lib/form-state'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox, Field, Input } from '@/components/ui/input'

/** Board-typical bands, pre-filled so a school edits rather than types. */
const DEFAULT_BANDS = [
  ['A+', '90', '100', '10', true],
  ['A', '75', '89.99', '9', true],
  ['B', '60', '74.99', '8', true],
  ['C', '33', '59.99', '6', true],
  ['D', '0', '32.99', '0', false],
] as const

export function GradeScaleForm() {
  const [state, action, pending] = useActionState(createGradingScaleAction, emptyFormState)

  return (
    <form action={action}>
      <Card>
        <CardHeader>
          <CardTitle>New grading scale</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {state.error ? (
            <p role="alert" className="text-sm text-[var(--danger)]">
              {state.error}
            </p>
          ) : null}

          <Field label="Name" htmlFor="name" required>
            <Input id="name" name="name" placeholder="CBSE percentage scale" required />
          </Field>

          <label className="flex items-center gap-2 text-sm text-ink">
            <Checkbox name="isDefault" defaultChecked />
            Use as the default scale
          </label>

          <div>
            <p className="caption mb-1.5">Bands</p>
            <table className="w-full">
              <thead>
                <tr className="text-left">
                  <th className="text-xs font-medium text-ink-subtle pb-1">Grade</th>
                  <th className="text-xs font-medium text-ink-subtle pb-1">Min %</th>
                  <th className="text-xs font-medium text-ink-subtle pb-1">Max %</th>
                  <th className="text-xs font-medium text-ink-subtle pb-1">Points</th>
                  <th className="text-xs font-medium text-ink-subtle pb-1 text-center">Pass</th>
                </tr>
              </thead>
              <tbody>
                {DEFAULT_BANDS.map(([grade, min, max, points, pass], index) => (
                  <tr key={grade}>
                    <td className="py-1 pr-1">
                      <Input
                        name={`grade-${index}`}
                        defaultValue={grade}
                        aria-label={`Band ${index + 1} grade`}
                        required
                      />
                    </td>
                    <td className="py-1 pr-1">
                      <Input
                        name={`min-${index}`}
                        type="number"
                        step="0.01"
                        defaultValue={min}
                        aria-label={`Band ${index + 1} minimum percentage`}
                        className="tnum"
                        required
                      />
                    </td>
                    <td className="py-1 pr-1">
                      <Input
                        name={`max-${index}`}
                        type="number"
                        step="0.01"
                        defaultValue={max}
                        aria-label={`Band ${index + 1} maximum percentage`}
                        className="tnum"
                        required
                      />
                    </td>
                    <td className="py-1 pr-1">
                      <Input
                        name={`points-${index}`}
                        type="number"
                        step="0.01"
                        defaultValue={points}
                        aria-label={`Band ${index + 1} grade points`}
                        className="tnum"
                      />
                    </td>
                    <td className="py-1 text-center">
                      <Checkbox
                        name={`pass-${index}`}
                        defaultChecked={pass}
                        aria-label={`Band ${index + 1} counts as a pass`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Button type="submit" loading={pending}>
            <Save aria-hidden />
            Save scale
          </Button>
        </CardContent>
      </Card>
    </form>
  )
}
