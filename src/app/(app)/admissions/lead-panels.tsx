'use client'

import { useActionState, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  completeFollowUpAction,
  convertLeadAction,
  createFollowUpAction,
  draftFollowUpAction,
  leadBriefAction,
  moveLeadStageAction,
  suggestNextActionAction,
} from './actions'
import { emptyFormState } from '@/lib/form-state'
import { FOLLOW_UP_CHANNELS, LEAD_STAGES, STAGE_LABELS } from '@/lib/admissions'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'
import { Badge } from '@/components/ui/badge'

export function StageControls({
  leadId,
  stage,
  canManage,
}: {
  leadId: string
  stage: string
  canManage: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [lostReason, setLostReason] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  if (!canManage || stage === 'ENROLLED') return null

  return (
    <div className="space-y-2">
      <Field label="Move to stage" htmlFor="stage">
        <Select
          id="stage"
          defaultValue={stage}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.value
            if (next === 'LOST' && !lostReason.trim()) {
              setMessage('Enter a lost reason below, then choose Lost again')
              return
            }
            startTransition(async () => {
              const result = await moveLeadStageAction(
                leadId,
                next,
                next === 'LOST' ? lostReason : undefined,
              )
              setMessage(result.message)
              if (result.ok) router.refresh()
            })
          }}
        >
          {LEAD_STAGES.filter((s) => s !== 'ENROLLED').map((s) => (
            <option key={s} value={s}>
              {STAGE_LABELS[s]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Lost reason (required for Lost)" htmlFor="lostReason">
        <Input
          id="lostReason"
          value={lostReason}
          onChange={(e) => setLostReason(e.target.value)}
          placeholder="e.g. Chose another school"
        />
      </Field>
      {message ? <p className="text-xs text-ink-muted">{message}</p> : null}
    </div>
  )
}

export function FollowUpForm({ leadId }: { leadId: string }) {
  const bound = createFollowUpAction.bind(null, leadId)
  const [state, action, pending] = useActionState(bound, emptyFormState)

  return (
    <form action={action} className="space-y-3">
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.ok ? <Notice tone="success">{state.message}</Notice> : null}
      <Field label="Due on" htmlFor="dueOn" required>
        <Input id="dueOn" name="dueOn" type="date" required />
      </Field>
      <Field label="Channel" htmlFor="channel">
        <Select id="channel" name="channel" defaultValue="CALL">
          {FOLLOW_UP_CHANNELS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Note" htmlFor="note">
        <Textarea id="note" name="note" rows={2} />
      </Field>
      <Button type="submit" loading={pending} size="sm">
        Schedule follow-up
      </Button>
    </form>
  )
}

export function CompleteFollowUpButton({
  followUpId,
  leadId,
}: {
  followUpId: string
  leadId: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [outcome, setOutcome] = useState('')

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <Field label="Outcome" htmlFor={`outcome-${followUpId}`}>
        <Input
          id={`outcome-${followUpId}`}
          value={outcome}
          onChange={(e) => setOutcome(e.target.value)}
          placeholder="What was said / agreed"
        />
      </Field>
      <Button
        size="sm"
        loading={pending}
        disabled={outcome.trim().length < 2}
        onClick={() =>
          startTransition(async () => {
            await completeFollowUpAction(followUpId, leadId, outcome)
            router.refresh()
          })
        }
      >
        Mark done
      </Button>
    </div>
  )
}

export function ConvertLeadForm({
  leadId,
  classes,
}: {
  leadId: string
  classes: { id: string; name: string; sections: { id: string; name: string }[] }[]
}) {
  const bound = convertLeadAction.bind(null, leadId)
  const [state, action, pending] = useActionState(bound, emptyFormState)
  const [classId, setClassId] = useState(classes[0]?.id ?? '')
  const sections = classes.find((c) => c.id === classId)?.sections ?? []

  return (
    <form action={action} className="space-y-3">
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      <Field label="Admission number" htmlFor="admissionNo" required error={state.fieldErrors.admissionNo}>
        <Input id="admissionNo" name="admissionNo" required />
      </Field>
      <Field label="Class" htmlFor="classLevelId" required>
        <Select
          id="classLevelId"
          name="classLevelId"
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
          required
        >
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Section" htmlFor="sectionId" required>
        <Select id="sectionId" name="sectionId" required defaultValue={sections[0]?.id ?? ''}>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Guardian relation" htmlFor="guardianRelation">
        <Select id="guardianRelation" name="guardianRelation" defaultValue="GUARDIAN">
          <option value="FATHER">Father</option>
          <option value="MOTHER">Mother</option>
          <option value="GUARDIAN">Guardian</option>
          <option value="OTHER">Other</option>
        </Select>
      </Field>
      <Button type="submit" loading={pending}>
        Convert to student
      </Button>
    </form>
  )
}

export function AiAssistPanel({ leadId, canManage }: { leadId: string; canManage: boolean }) {
  const [pending, startTransition] = useTransition()
  const [panel, setPanel] = useState<{
    title: string
    body: string
    meta?: string
  } | null>(null)

  function run(kind: 'suggest' | 'draft' | 'brief') {
    startTransition(async () => {
      if (kind === 'suggest') {
        const result = await suggestNextActionAction(leadId)
        const data = result.data as
          | {
              rationale: string
              talkingPoints: string[]
              priority: string
              channel: string
              followUpWithinDays: number
              recommendedStage: string | null
              source: string
            }
          | undefined
        if (!result.ok || !data) {
          setPanel({ title: 'Suggestion failed', body: result.message })
          return
        }
        setPanel({
          title: `Next action (${data.source}) · ${data.priority} priority`,
          meta: `Follow up in ${data.followUpWithinDays} day(s) via ${data.channel}${
            data.recommendedStage ? ` · consider ${data.recommendedStage}` : ''
          }`,
          body: `${data.rationale}\n\n${data.talkingPoints.map((p) => `• ${p}`).join('\n')}`,
        })
      } else if (kind === 'draft') {
        const result = await draftFollowUpAction(leadId)
        const data = result.data as
          | { body: string; channel: string; subject?: string | null; source: string }
          | undefined
        if (!result.ok || !data) {
          setPanel({ title: 'Draft failed', body: result.message })
          return
        }
        setPanel({
          title: `Draft ${data.channel} (${data.source}) — copy & send yourself`,
          meta: data.subject ?? undefined,
          body: data.body,
        })
      } else {
        const result = await leadBriefAction(leadId)
        const data = result.data as
          | { brief: string; risks: string[]; openQuestions: string[]; source: string }
          | undefined
        if (!result.ok || !data) {
          setPanel({ title: 'Brief failed', body: result.message })
          return
        }
        setPanel({
          title: `Call brief (${data.source})`,
          body: `${data.brief}\n\nRisks:\n${data.risks.map((r) => `• ${r}`).join('\n') || '• None flagged'}\n\nOpen questions:\n${data.openQuestions.map((q) => `• ${q}`).join('\n')}`,
        })
      }
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" loading={pending} onClick={() => run('suggest')}>
          Suggest next action
        </Button>
        <Button size="sm" variant="secondary" loading={pending} onClick={() => run('brief')}>
          Call brief
        </Button>
        {canManage ? (
          <Button size="sm" variant="secondary" loading={pending} onClick={() => run('draft')}>
            Draft message
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-ink-subtle">
        AI never sends messages or moves stages. Suggestions fall back to rules when AI is off.
      </p>
      {panel ? (
        <div className="rounded-[var(--radius-sm)] border border-line bg-surface-2/50 p-3">
          <p className="text-sm font-medium text-ink">{panel.title}</p>
          {panel.meta ? <p className="mt-1 text-xs text-ink-muted">{panel.meta}</p> : null}
          <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-ink-muted">{panel.body}</pre>
          <Badge tone="neutral">
            Counsellor review required
          </Badge>
        </div>
      ) : null}
    </div>
  )
}
