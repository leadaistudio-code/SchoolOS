'use client'

import { useActionState, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  completeFollowUpAction,
  completeMeetingAction,
  conversationSummaryAction,
  createContactAction,
  createFollowUpAction,
  createTaskAction,
  logActivityAction,
  logVisitAction,
  meetingBriefAction,
  moveStageAction,
  nextActionIntelAction,
  quickFollowUpAction,
  riskAnalysisAction,
  scheduleMeetingAction,
  setTaskStatusAction,
  updateSchoolAction,
} from '../../actions'
import { emptyFormState } from '@/lib/form-state'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'
import {
  ACTIVITY_TYPES,
  ACTIVITY_TYPE_LABELS,
  CONTACT_ROLES,
  CONTACT_ROLE_LABELS,
  CRM_STAGES,
  FOLLOW_UP_TYPES,
  FOLLOW_UP_TYPE_LABELS,
  LOST_REASONS,
  LOST_REASON_LABELS,
  MEETING_MODES,
  MEETING_MODE_LABELS,
  MEETING_TYPES,
  STAGE_LABELS,
  TASK_PRIORITIES,
} from '@/lib/growth-crm'

export function StageForm({ schoolId, stage }: { schoolId: string; stage: string }) {
  const action = moveStageAction.bind(null, schoolId)
  const [state, formAction, pending] = useActionState(action, emptyFormState)
  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.ok ? <Notice tone="success">{state.message}</Notice> : null}
      <Field label="Stage" htmlFor="stage">
        <Select id="stage" name="stage" defaultValue={stage}>
          {CRM_STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABELS[s]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Lost reason" htmlFor="lostReason">
        <Select id="lostReason" name="lostReason" defaultValue="">
          <option value="">Required when marking Lost</option>
          {LOST_REASONS.map((r) => (
            <option key={r} value={r}>
              {LOST_REASON_LABELS[r]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Competitor if lost" htmlFor="lostCompetitor">
        <Input id="lostCompetitor" name="lostCompetitor" />
      </Field>
      <Field label="Lost notes" htmlFor="lostNotes">
        <Textarea id="lostNotes" name="lostNotes" rows={2} />
      </Field>
      <Field label="Revisit on" htmlFor="recontactOn">
        <Input id="recontactOn" name="recontactOn" type="date" />
      </Field>
      <Button type="submit" loading={pending} size="sm">
        Update stage
      </Button>
    </form>
  )
}

export function OpportunityForm({
  schoolId,
  ownerId,
  dealValue,
  arr,
  probability,
  competitor,
  primaryObjection,
  nextAction,
  operators,
  canAssign,
}: {
  schoolId: string
  ownerId: string
  dealValue: string
  arr: string
  probability: number
  competitor: string
  primaryObjection: string
  nextAction: string
  operators: { id: string; firstName: string; lastName: string }[]
  canAssign: boolean
}) {
  const action = updateSchoolAction.bind(null, schoolId)
  const [state, formAction, pending] = useActionState(action, emptyFormState)
  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.ok ? <Notice tone="success">{state.message}</Notice> : null}
      {canAssign ? (
        <Field label="Owner" htmlFor="ownerId">
          <Select id="ownerId" name="ownerId" defaultValue={ownerId}>
            <option value="">Unassigned</option>
            {operators.map((op) => (
              <option key={op.id} value={op.id}>
                {op.firstName} {op.lastName}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Deal (₹)" htmlFor="dealValue">
          <Input id="dealValue" name="dealValue" defaultValue={dealValue} inputMode="decimal" />
        </Field>
        <Field label="ARR (₹)" htmlFor="arr">
          <Input id="arr" name="arr" defaultValue={arr} inputMode="decimal" />
        </Field>
      </div>
      <Field label="Probability %" htmlFor="probability">
        <Input id="probability" name="probability" defaultValue={String(probability)} inputMode="numeric" />
      </Field>
      <Field label="Competitor" htmlFor="competitor">
        <Input id="competitor" name="competitor" defaultValue={competitor} />
      </Field>
      <Field label="Primary objection" htmlFor="primaryObjection">
        <Input id="primaryObjection" name="primaryObjection" defaultValue={primaryObjection} />
      </Field>
      <Field label="Next action" htmlFor="nextAction">
        <Input id="nextAction" name="nextAction" defaultValue={nextAction} />
      </Field>
      <Button type="submit" loading={pending} size="sm">
        Save opportunity
      </Button>
    </form>
  )
}

export function ContactForm({ schoolId }: { schoolId: string }) {
  const action = createContactAction.bind(null, schoolId)
  const [state, formAction, pending] = useActionState(action, emptyFormState)
  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      <Field label="Full name" htmlFor="fullName" required>
        <Input id="fullName" name="fullName" required />
      </Field>
      <Field label="Designation" htmlFor="designation">
        <Select id="designation" name="designation" defaultValue="PRINCIPAL">
          {CONTACT_ROLES.map((r) => (
            <option key={r} value={r}>
              {CONTACT_ROLE_LABELS[r]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Mobile" htmlFor="mobile">
        <Input id="mobile" name="mobile" inputMode="tel" />
      </Field>
      <Field label="WhatsApp" htmlFor="whatsapp">
        <Input id="whatsapp" name="whatsapp" inputMode="tel" />
      </Field>
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" />
      </Field>
      <label className="flex items-center gap-2 text-sm text-ink-muted">
        <Checkbox name="isPrimary" /> Primary contact
      </label>
      <label className="flex items-center gap-2 text-sm text-ink-muted">
        <Checkbox name="isDecisionMaker" /> Decision maker
      </label>
      <label className="flex items-center gap-2 text-sm text-ink-muted">
        <Checkbox name="isInfluencer" /> Influencer
      </label>
      <Button type="submit" loading={pending} size="sm">
        Add contact
      </Button>
    </form>
  )
}

export function ActivityForm({
  schoolId,
  contacts,
  defaultType = 'OUTGOING_CALL',
}: {
  schoolId: string
  contacts: { id: string; fullName: string }[]
  defaultType?: string
}) {
  const action = logActivityAction.bind(null, schoolId)
  const [state, formAction, pending] = useActionState(action, emptyFormState)
  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Type" htmlFor="type">
          <Select id="type" name="type" defaultValue={defaultType}>
            {ACTIVITY_TYPES.filter((t) => t !== 'STAGE_CHANGE' && t !== 'OWNER_CHANGE').map((t) => (
              <option key={t} value={t}>
                {ACTIVITY_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Contact" htmlFor="contactId">
          <Select id="contactId" name="contactId" defaultValue="">
            <option value="">School generally</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.fullName}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="What happened" htmlFor="summary" required>
        <Input id="summary" name="summary" required placeholder="Called the principal, asked to send proposal" />
      </Field>
      <Field label="Notes" htmlFor="body">
        <Textarea id="body" name="body" rows={3} />
      </Field>
      <Button type="submit" loading={pending} size="sm">
        Log activity
      </Button>
    </form>
  )
}

export function VisitForm({ schoolId }: { schoolId: string }) {
  const action = logVisitAction.bind(null, schoolId)
  const [state, formAction, pending] = useActionState(action, emptyFormState)
  const today = new Date().toISOString().slice(0, 10)
  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.ok ? <Notice tone="success">{state.message}</Notice> : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Visit date" htmlFor="visitDate" required>
          <Input id="visitDate" name="visitDate" type="date" defaultValue={today} required />
        </Field>
        <Field label="Start" htmlFor="startTime">
          <Input id="startTime" name="startTime" type="time" />
        </Field>
        <Field label="End" htmlFor="endTime">
          <Input id="endTime" name="endTime" type="time" />
        </Field>
      </div>
      <Field label="Who we met" htmlFor="contactsMet">
        <Input id="contactsMet" name="contactsMet" placeholder="Principal Anita Sharma" />
      </Field>
      <Field label="Our team" htmlFor="teamMembers">
        <Input id="teamMembers" name="teamMembers" placeholder="Aryan, Santosh" />
      </Field>
      <Field label="Purpose" htmlFor="purpose">
        <Input id="purpose" name="purpose" placeholder="Discovery, demo, proposal" />
      </Field>
      <Field label="Meeting type" htmlFor="meetingType">
        <Select id="meetingType" name="meetingType" defaultValue="First meeting">
          {['First meeting', 'Discovery', 'Demo', 'Follow-up', 'Proposal discussion', 'Negotiation', 'Pilot discussion', 'Closure'].map(
            (t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ),
          )}
        </Select>
      </Field>
      <Field label="What was discussed" htmlFor="summary" required>
        <Textarea id="summary" name="summary" rows={4} required />
      </Field>
      <Field label="Pain points" htmlFor="painPoints">
        <Textarea id="painPoints" name="painPoints" rows={2} />
      </Field>
      <Field label="Current ERP" htmlFor="currentErp">
        <Input id="currentErp" name="currentErp" />
      </Field>
      <Field label="What they liked" htmlFor="liked">
        <Input id="liked" name="liked" />
      </Field>
      <Field label="Objections" htmlFor="objections">
        <Input id="objections" name="objections" />
      </Field>
      <Field label="Competitors" htmlFor="competitors">
        <Input id="competitors" name="competitors" />
      </Field>
      <Field label="Documents they asked for" htmlFor="documentsRequested">
        <Input id="documentsRequested" name="documentsRequested" />
      </Field>
      <Field label="Deal confidence" htmlFor="dealConfidence">
        <Select id="dealConfidence" name="dealConfidence" defaultValue="">
          <option value="">Not set</option>
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
        </Select>
      </Field>
      <Field label="Next action" htmlFor="nextAction">
        <Input id="nextAction" name="nextAction" />
      </Field>
      <label className="flex items-center gap-2 text-sm text-ink-muted">
        <Checkbox name="followUpRequired" defaultChecked /> Schedule a follow-up
      </label>
      <Field label="Follow-up at" htmlFor="followUpAt">
        <Input id="followUpAt" name="followUpAt" type="datetime-local" />
      </Field>
      <Button type="submit" loading={pending} size="sm">
        Log visit
      </Button>
    </form>
  )
}

export function FollowUpForm({
  schoolId,
  contacts,
}: {
  schoolId: string
  contacts: { id: string; fullName: string }[]
}) {
  const action = createFollowUpAction.bind(null, schoolId)
  const [state, formAction, pending] = useActionState(action, emptyFormState)
  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Due date" htmlFor="dueAt" required>
          <Input id="dueAt" name="dueAt" type="date" required />
        </Field>
        <Field label="Time" htmlFor="dueTime">
          <Input id="dueTime" name="dueTime" type="time" defaultValue="10:00" />
        </Field>
        <Field label="Type" htmlFor="type">
          <Select id="type" name="type" defaultValue="CALL">
            {FOLLOW_UP_TYPES.map((t) => (
              <option key={t} value={t}>
                {FOLLOW_UP_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Contact" htmlFor="contactId">
          <Select id="contactId" name="contactId" defaultValue="">
            <option value="">School</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.fullName}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Note" htmlFor="note">
        <Input id="note" name="note" />
      </Field>
      <Button type="submit" loading={pending} size="sm">
        Schedule follow-up
      </Button>
    </form>
  )
}

export function QuickFollowUp({ schoolId }: { schoolId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [type, setType] = useState<(typeof FOLLOW_UP_TYPES)[number]>('CALL')
  const chips: { label: string; days: number }[] = [
    { label: 'Tomorrow', days: 1 },
    { label: 'In 2 days', days: 2 },
    { label: 'In 3 days', days: 3 },
    { label: 'Next week', days: 7 },
  ]
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-ink-muted">What&apos;s next?</p>
      <div className="flex flex-wrap gap-1.5">
        {FOLLOW_UP_TYPES.filter((t) => t !== 'OTHER').map((t) => (
          <button
            key={t}
            type="button"
            className={`rounded-[var(--radius-sm)] border px-2 py-1 text-xs ${
              type === t ? 'border-[var(--brand-500)] bg-[var(--brand-50)] text-ink' : 'border-line text-ink-muted'
            }`}
            onClick={() => setType(t)}
          >
            {FOLLOW_UP_TYPE_LABELS[t]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {chips.map((chip) => (
          <button
            key={chip.days}
            type="button"
            disabled={pending}
            className="min-h-9 rounded-[var(--radius-sm)] border border-line px-2.5 py-1.5 text-xs text-ink hover:bg-surface-2"
            onClick={() =>
              start(async () => {
                await quickFollowUpAction(schoolId, chip.days, type)
                router.refresh()
              })
            }
          >
            {chip.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function ActivityTimeline({
  activities,
}: {
  activities: {
    id: string
    type: string
    summary: string
    body: string | null
    actorLabel: string | null
    createdAt: Date
  }[]
}) {
  const [type, setType] = useState('')
  const rows = type ? activities.filter((a) => a.type === type) : activities
  return (
    <div className="space-y-3">
      <Select
        aria-label="Filter activity"
        value={type}
        onChange={(e) => setType(e.target.value)}
      >
        <option value="">All activity</option>
        {ACTIVITY_TYPES.map((t) => (
          <option key={t} value={t}>
            {ACTIVITY_TYPE_LABELS[t]}
          </option>
        ))}
      </Select>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-muted">No matching activity.</p>
      ) : (
        <ol className="space-y-3">
          {rows.map((a) => (
            <li key={a.id} className="border-l-2 border-line pl-3">
              <p className="text-[11px] uppercase tracking-wide text-ink-subtle">
                {new Date(a.createdAt).toLocaleString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}{' '}
                · {ACTIVITY_TYPE_LABELS[a.type as keyof typeof ACTIVITY_TYPE_LABELS] ?? a.type}
              </p>
              <p className="text-sm text-ink">{a.summary}</p>
              {a.body ? <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink-muted">{a.body}</p> : null}
              {a.actorLabel ? <p className="text-xs text-ink-subtle">{a.actorLabel}</p> : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

export function CompleteFollowUpButton({ id, schoolId }: { id: string; schoolId: string }) {
  return (
    <form action={completeFollowUpAction.bind(null, id, schoolId)}>
      <button type="submit" className="min-h-9 text-xs font-medium text-[var(--brand-600)] hover:underline">
        Mark done
      </button>
    </form>
  )
}

export function MeetingForm({
  schoolId,
  contacts,
}: {
  schoolId: string
  contacts: { id: string; fullName: string }[]
}) {
  const action = scheduleMeetingAction.bind(null, schoolId)
  const [state, formAction, pending] = useActionState(action, emptyFormState)
  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.ok ? <Notice tone="success">{state.message}</Notice> : null}
      <Field label="Starts" htmlFor="startsAt" required>
        <Input id="startsAt" name="startsAt" type="datetime-local" required />
      </Field>
      <Field label="Ends" htmlFor="endsAt">
        <Input id="endsAt" name="endsAt" type="datetime-local" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Type" htmlFor="meetingType">
          <Select id="meetingType" name="meetingType" defaultValue="Discovery">
            {MEETING_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Where" htmlFor="mode">
          <Select id="mode" name="mode" defaultValue="PHYSICAL">
            {MEETING_MODES.map((m) => (
              <option key={m} value={m}>
                {MEETING_MODE_LABELS[m]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Location" htmlFor="location">
        <Input id="location" name="location" placeholder="School office / Google Meet" />
      </Field>
      <Field label="Meeting link" htmlFor="meetingLink">
        <Input id="meetingLink" name="meetingLink" placeholder="https://" />
      </Field>
      <Field label="Contact" htmlFor="contactId">
        <Select id="contactId" name="contactId" defaultValue="">
          <option value="">School</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.fullName}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Agenda" htmlFor="agenda">
        <Textarea id="agenda" name="agenda" rows={2} />
      </Field>
      <Button type="submit" loading={pending} size="sm">
        Schedule meeting
      </Button>
    </form>
  )
}

export function TaskForm({
  schoolId,
  contacts,
  operators,
}: {
  schoolId: string
  contacts: { id: string; fullName: string }[]
  operators: { id: string; firstName: string; lastName: string }[]
}) {
  const action = createTaskAction.bind(null, schoolId)
  const [state, formAction, pending] = useActionState(action, emptyFormState)
  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.ok ? <Notice tone="success">{state.message}</Notice> : null}
      <Field label="Task" htmlFor="title" required>
        <Input id="title" name="title" required placeholder="Prepare proposal" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Due date" htmlFor="dueAt">
          <Input id="dueAt" name="dueAt" type="date" />
        </Field>
        <Field label="Time" htmlFor="dueTime">
          <Input id="dueTime" name="dueTime" type="time" />
        </Field>
        <Field label="Priority" htmlFor="priority">
          <Select id="priority" name="priority" defaultValue="NORMAL">
            {TASK_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p.toLowerCase()}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Owner" htmlFor="ownerId">
          <Select id="ownerId" name="ownerId" defaultValue={operators[0]?.id ?? ''}>
            {operators.map((op) => (
              <option key={op.id} value={op.id}>
                {op.firstName} {op.lastName}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Contact" htmlFor="contactId">
        <Select id="contactId" name="contactId" defaultValue="">
          <option value="">School</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.fullName}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Notes" htmlFor="description">
        <Textarea id="description" name="description" rows={2} />
      </Field>
      <Button type="submit" loading={pending} size="sm">
        Add task
      </Button>
    </form>
  )
}

export function CompleteMeetingButton({ id, schoolId }: { id: string; schoolId: string }) {
  return (
    <form action={completeMeetingAction.bind(null, id, schoolId)}>
      <button type="submit" className="min-h-9 text-xs font-medium text-[var(--brand-600)] hover:underline">
        Done
      </button>
    </form>
  )
}

export function CompleteTaskButton({ id, schoolId }: { id: string; schoolId: string }) {
  return (
    <form action={setTaskStatusAction.bind(null, id, schoolId, 'COMPLETED')}>
      <button type="submit" className="min-h-9 text-xs font-medium text-[var(--brand-600)] hover:underline">
        Done
      </button>
    </form>
  )
}

export function IntelPanel({ schoolId }: { schoolId: string }) {
  const [pending, startTransition] = useTransition()
  const [panel, setPanel] = useState<{ title: string; body: string; meta?: string } | null>(null)

  function run(kind: 'brief' | 'summary' | 'next' | 'risk') {
    startTransition(async () => {
      if (kind === 'brief') {
        const result = await meetingBriefAction(schoolId)
        const data = result.data as
          | {
              facts: string[]
              recommendations: string[]
              objective: string
              risks: string[]
              source: string
            }
          | undefined
        if (!result.ok || !data) {
          setPanel({ title: 'Brief failed', body: result.message })
          return
        }
        setPanel({
          title: `Meeting brief (${data.source})`,
          meta: data.objective,
          body: [
            'Facts',
            ...data.facts.map((f) => `• ${f}`),
            '',
            'Recommendations',
            ...data.recommendations.map((r) => `• ${r}`),
            '',
            'Risks',
            ...(data.risks.length ? data.risks.map((r) => `• ${r}`) : ['• None flagged']),
          ].join('\n'),
        })
        return
      }

      if (kind === 'summary') {
        const result = await conversationSummaryAction(schoolId)
        const data = result.data as
          | { summary: string; highlights: string[]; source: string }
          | undefined
        if (!result.ok || !data) {
          setPanel({ title: 'Summary failed', body: result.message })
          return
        }
        setPanel({
          title: `Conversation summary (${data.source})`,
          body: `${data.summary}\n\n${data.highlights.map((h) => `• ${h}`).join('\n')}`,
        })
        return
      }

      if (kind === 'next') {
        const result = await nextActionIntelAction(schoolId)
        const data = result.data as
          | {
              rationale: string
              talkingPoints: string[]
              priority: string
              channel: string
              followUpWithinDays: number
              objective: string
              source: string
            }
          | undefined
        if (!result.ok || !data) {
          setPanel({ title: 'Suggestion failed', body: result.message })
          return
        }
        setPanel({
          title: `Next action (${data.source}) · ${data.priority}`,
          meta: `${data.objective} · follow up in ${data.followUpWithinDays} day(s) via ${data.channel}`,
          body: `${data.rationale}\n\n${data.talkingPoints.map((p) => `• ${p}`).join('\n')}`,
        })
        return
      }

      const result = await riskAnalysisAction(schoolId)
      const data = result.data as
        | {
            level: string
            score: number
            risks: { label: string; severity: string }[]
            source: string
          }
        | undefined
      if (!result.ok || !data) {
        setPanel({ title: 'Risk analysis failed', body: result.message })
        return
      }
      setPanel({
        title: `Deal risk ${data.level} (${data.source})`,
        meta: `Score ${data.score}`,
        body: data.risks.length
          ? data.risks.map((r) => `• [${r.severity}] ${r.label}`).join('\n')
          : '• No material risks flagged',
      })
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" loading={pending} onClick={() => run('brief')}>
          Meeting brief
        </Button>
        <Button size="sm" variant="secondary" loading={pending} onClick={() => run('summary')}>
          Conversation summary
        </Button>
        <Button size="sm" variant="secondary" loading={pending} onClick={() => run('next')}>
          Next action
        </Button>
        <Button size="sm" variant="secondary" loading={pending} onClick={() => run('risk')}>
          Risk analysis
        </Button>
      </div>
      <p className="text-xs text-ink-subtle">
        Facts come from CRM data. Recommendations are suggestions only — AI never sends messages or
        moves stages. Falls back to rules when AI is off.
      </p>
      {panel ? (
        <div className="rounded-[var(--radius-sm)] border border-line bg-surface-2/50 p-3">
          <p className="text-sm font-medium text-ink">{panel.title}</p>
          {panel.meta ? <p className="mt-1 text-xs text-ink-muted">{panel.meta}</p> : null}
          <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-ink-muted">{panel.body}</pre>
          <Badge tone="neutral">Rep review required</Badge>
        </div>
      ) : null}
    </div>
  )
}
