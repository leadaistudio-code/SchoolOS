'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { moderateAnswerAction } from '../workflow-actions'

type Decision = 'APPROVED' | 'HIDDEN' | 'ESCALATED' | 'FLAGGED'

const CHOICES: { value: Decision; label: string; needsReason?: boolean }[] = [
  { value: 'APPROVED', label: 'Approve' },
  { value: 'FLAGGED', label: 'Flag', needsReason: true },
  { value: 'HIDDEN', label: 'Hide', needsReason: true },
  { value: 'ESCALATED', label: 'Escalate', needsReason: true },
]

/**
 * Four buttons and a reason box.
 *
 * Hiding, flagging and escalating all take a reason because each one is a
 * decision somebody may have to defend later; approving does not, because
 * "this comment is ordinary" needs no explanation. The box only appears once
 * a decision that needs it has been chosen, so the common case stays one
 * click.
 */
export function ModerationDecision({
  answerId,
  status,
}: {
  answerId: string
  status: string
}) {
  const toast = useToast()
  const [pending, startTransition] = React.useTransition()
  const [choice, setChoice] = React.useState<Decision | null>(null)
  const [reason, setReason] = React.useState('')

  const needsReason = CHOICES.find((c) => c.value === choice)?.needsReason ?? false

  const commit = (decision: Decision, withReason: string) =>
    startTransition(async () => {
      const result = await moderateAnswerAction({
        answerId,
        status: decision,
        flagReason: withReason.trim() || undefined,
      })
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Could not save', description: result.message })
        return
      }
      toast.push({ tone: 'success', title: 'Decision recorded', description: result.message })
      setChoice(null)
      setReason('')
    })

  const pick = (decision: Decision) => {
    if (CHOICES.find((c) => c.value === decision)?.needsReason) {
      setChoice(decision)
      return
    }
    commit(decision, '')
  }

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {CHOICES.map((c) => (
          <Button
            key={c.value}
            size="sm"
            variant={choice === c.value ? 'primary' : 'secondary'}
            disabled={pending || status === c.value}
            onClick={() => pick(c.value)}
          >
            {status === c.value ? `${c.label}d` : c.label}
          </Button>
        ))}
      </div>

      {needsReason && choice ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={reason}
            autoFocus
            placeholder={
              choice === 'ESCALATED'
                ? 'What needs safeguarding attention?'
                : 'Why — in a few words'
            }
            className="max-w-md"
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && reason.trim()) commit(choice, reason)
            }}
          />
          <Button
            size="sm"
            loading={pending}
            disabled={!reason.trim()}
            onClick={() => commit(choice, reason)}
          >
            Confirm
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setChoice(null)}>
            Cancel
          </Button>
        </div>
      ) : null}
    </div>
  )
}
