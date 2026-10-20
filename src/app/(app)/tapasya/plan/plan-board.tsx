'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Flame, Lock, Plus, Trash2 } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/button'
import { Card, CardContent, Section } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/input'
import { EmptyState, Notice } from '@/components/ui/states'
import { buttonVariants } from '@/components/ui/button-variants'
import { useToast } from '@/components/ui/toast'
import type { TaskDto } from '@/server/modules/tapasya/tasks'
import type { DayPlan, DayReview } from '@/lib/tapasya/planner'
import { api } from '../_components/api'

const CATEGORIES = [
  ['HOMEWORK', 'Homework'],
  ['CHAPTER', 'Chapter'],
  ['REVISION', 'Revision'],
  ['PERSONAL', 'Personal goal'],
  ['OTHER', 'Other'],
] as const

const SCALE = [1, 2, 3, 4, 5]

function emptyDraft() {
  return { title: '', subject: '', category: 'HOMEWORK', difficulty: 3, importance: 3, urgency: 3, estimatedMinutes: 25, dueOn: '', description: '' }
}

export function PlanBoard({ tasks, frogIds, primaryId }: { tasks: TaskDto[]; frogIds: string[]; primaryId: string | null }) {
  const router = useRouter()
  const { push } = useToast()
  const [draft, setDraft] = React.useState(emptyDraft)
  const [adding, setAdding] = React.useState(false)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [frogs, setFrogs] = React.useState<string[]>(frogIds)
  const [primary, setPrimary] = React.useState<string | null>(primaryId)
  const [available, setAvailable] = React.useState(120)
  const [focus, setFocus] = React.useState(25)
  const [plan, setPlan] = React.useState<DayPlan | null>(null)
  const [review, setReview] = React.useState<(DayReview & { today: string }) | null>(null)

  const fail = (title: string) => (err: unknown) => push({ tone: 'error', title, description: (err as Error).message })

  async function addTask(e: React.FormEvent) {
    e.preventDefault()
    setBusy('add')
    try {
      await api('/api/v1/tapasya/tasks', {
        method: 'POST',
        body: {
          ...draft,
          subject: draft.subject || null,
          description: draft.description || null,
          dueOn: draft.dueOn || null,
          estimatedMinutes: Number(draft.estimatedMinutes),
        },
      })
      setDraft(emptyDraft())
      setAdding(false)
      push({ tone: 'success', title: 'Task added' })
      router.refresh()
    } catch (err) {
      fail('Task not added')(err)
    } finally {
      setBusy(null)
    }
  }

  async function setStatus(task: TaskDto, status: 'DONE' | 'TODO') {
    setBusy(task.id)
    try {
      await api(`/api/v1/tapasya/tasks/${task.id}`, { method: 'PATCH', body: { status } })
      if (status === 'DONE') push({ tone: 'success', title: 'Marked done', description: task.isPrimaryFrog ? 'If you focused on it today, the frog bonus is added to your XP.' : undefined })
      router.refresh()
    } catch (err) {
      fail('Not updated')(err)
    } finally {
      setBusy(null)
    }
  }

  async function remove(task: TaskDto) {
    if (!window.confirm(`Remove "${task.title}"?`)) return
    setBusy(task.id)
    try {
      await api(`/api/v1/tapasya/tasks/${task.id}`, { method: 'DELETE' })
      router.refresh()
    } catch (err) {
      fail('Not removed')(err)
    } finally {
      setBusy(null)
    }
  }

  async function saveFrogs() {
    setBusy('frogs')
    try {
      await api('/api/v1/tapasya/frogs', { method: 'PUT', body: { taskIds: frogs, primaryTaskId: primary } })
      push({ tone: 'success', title: 'Frogs saved', description: primary ? 'Your primary frog is on your dashboard.' : undefined })
      router.refresh()
    } catch (err) {
      fail('Frogs not saved')(err)
    } finally {
      setBusy(null)
    }
  }

  async function suggest() {
    setBusy('plan')
    try {
      setPlan(await api<DayPlan>(`/api/v1/tapasya/plan?availableMinutes=${available}&focusMinutes=${focus}&breakMinutes=5`))
    } catch (err) {
      fail('No plan')(err)
    } finally {
      setBusy(null)
    }
  }

  async function loadReview() {
    setBusy('review')
    try {
      setReview(await api('/api/v1/tapasya/plan?review=1'))
    } catch (err) {
      fail('No review')(err)
    } finally {
      setBusy(null)
    }
  }

  function toggleFrog(id: string) {
    setFrogs((f) => {
      if (f.includes(id)) {
        if (primary === id) setPrimary(null)
        return f.filter((x) => x !== id)
      }
      if (f.length >= 5) {
        push({ tone: 'info', title: 'Five frogs at most', description: 'A short list is easier to finish.' })
        return f
      }
      return [...f, id]
    })
  }

  return (
    <div className="grid gap-5 [&>*]:min-w-0 xl:grid-cols-[1.4fr_1fr]">
      <div className="flex flex-col gap-5">
        <Section
          title="Tasks"
          description="Tick up to five frogs for today and star the primary one."
          actions={<Button size="sm" variant="secondary" onClick={() => setAdding((a) => !a)}><Plus aria-hidden /> Add task</Button>}
        >
          {adding ? (
            <Card className="mb-3">
              <CardContent className="pt-5">
                <form onSubmit={addTask} className="grid gap-3 sm:grid-cols-2">
                  <Field htmlFor="tpl-title" label="Title" required><Input id="tpl-title" required maxLength={120} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></Field>
                  <Field htmlFor="tpl-subject" label="Subject"><Input id="tpl-subject" maxLength={60} value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} /></Field>
                  <Field htmlFor="tpl-type" label="Type">
                    <Select id="tpl-type" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
                      {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </Select>
                  </Field>
                  <Field htmlFor="tpl-due-date" label="Due date"><Input id="tpl-due-date" type="date" value={draft.dueOn} onChange={(e) => setDraft({ ...draft, dueOn: e.target.value })} /></Field>
                  {(['importance', 'urgency', 'difficulty'] as const).map((k) => (
                    <Field htmlFor={`tpl-${k}`} key={k} label={k[0]!.toUpperCase() + k.slice(1)} hint="1 low · 5 high">
                      <Select id={`tpl-${k}`} value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: Number(e.target.value) })}>
                        {SCALE.map((n) => <option key={n} value={n}>{n}</option>)}
                      </Select>
                    </Field>
                  ))}
                  <Field htmlFor="tpl-estimated-minutes" label="Estimated minutes"><Input id="tpl-estimated-minutes" type="number" min={5} max={600} value={draft.estimatedMinutes} onChange={(e) => setDraft({ ...draft, estimatedMinutes: Number(e.target.value) })} /></Field>
                  <div className="sm:col-span-2"><Field htmlFor="tpl-notes" label="Notes"><Textarea id="tpl-notes" maxLength={2000} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field></div>
                  <div className="flex gap-2 sm:col-span-2">
                    <Button type="submit" loading={busy === 'add'}>Add task</Button>
                    <Button type="button" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          ) : null}

          {tasks.length === 0 ? (
            <Card><EmptyState title="No open tasks" description="Add homework, a chapter to finish or a revision goal. Tasks your teachers set appear here too." /></Card>
          ) : (
            <div className="flex flex-col gap-2">
              {tasks.map((t) => (
                <Card key={t.id}>
                  <CardContent className="flex flex-wrap items-start justify-between gap-3 pt-4 pb-4">
                    <div className="flex items-start gap-3">
                      <Checkbox aria-label={`Frog: ${t.title}`} checked={frogs.includes(t.id)} onChange={() => toggleFrog(t.id)} className="mt-1" />
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-ink">{t.title}</span>
                          {t.isTeacherAssigned ? <Badge tone={t.isMandatory ? 'warning' : 'info'}>{t.isMandatory ? 'Required by teacher' : 'From teacher'}</Badge> : null}
                          {t.status === 'IN_PROGRESS' ? <Badge tone="brand">In progress</Badge> : null}
                          {t.dueOn ? <Badge tone="neutral">Due {t.dueOn}</Badge> : null}
                        </div>
                        <p className="mt-1 text-sm text-ink-muted">
                          {t.subject ? `${t.subject} · ` : ''}Importance {t.importance} · Urgency {t.urgency} · Difficulty {t.difficulty} · {t.actualMinutes}/{t.estimatedMinutes} min
                        </p>
                        {t.teacherInstructions ? <p className="mt-1 text-sm text-ink-subtle">“{t.teacherInstructions}”</p> : null}
                        {t.requiredFocusMinutes ? <p className="mt-1 text-xs text-ink-subtle">Teacher set {t.requiredFocusMinutes}-minute focus for this task.</p> : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {frogs.includes(t.id) ? (
                        <Button size="sm" variant={primary === t.id ? 'primary' : 'ghost'} onClick={() => setPrimary(primary === t.id ? null : t.id)} aria-pressed={primary === t.id}>
                          <Flame aria-hidden /> {primary === t.id ? 'Primary frog' : 'Make primary'}
                        </Button>
                      ) : null}
                      <Link href={`/tapasya/focus?task=${t.id}`} className={buttonVariants({ variant: 'subtle', size: 'sm' })}>Focus</Link>
                      <Button size="sm" variant="secondary" loading={busy === t.id} onClick={() => setStatus(t, 'DONE')}>Done</Button>
                      {t.isMandatory || (t.isTeacherAssigned && !t.studentCanEdit) ? (
                        <span title="Your teacher set this task" className="px-2 text-ink-subtle"><Lock className="size-4" aria-label="Locked by teacher" /></span>
                      ) : (
                        <IconButton label={`Remove ${t.title}`} small onClick={() => remove(t)}><Trash2 aria-hidden /></IconButton>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
              <div className="flex items-center gap-3">
                <Button onClick={saveFrogs} loading={busy === 'frogs'}>Save today’s frogs</Button>
                <span className="text-sm text-ink-muted">{frogs.length} selected{primary ? ' · primary chosen' : ''}</span>
              </div>
            </div>
          )}
        </Section>
      </div>

      <div className="flex flex-col gap-5">
        <Section title="Priority planner" description="A suggested order for the time you have.">
          <Card>
            <CardContent className="pt-5">
              <div className="grid grid-cols-2 gap-3">
                <Field htmlFor="tpl-minutes-available" label="Minutes available"><Input id="tpl-minutes-available" type="number" min={15} max={720} value={available} onChange={(e) => setAvailable(Number(e.target.value))} /></Field>
                <Field htmlFor="tpl-focus-length" label="Focus length"><Input id="tpl-focus-length" type="number" min={5} max={180} value={focus} onChange={(e) => setFocus(Number(e.target.value))} /></Field>
              </div>
              <Button className="mt-3" variant="secondary" onClick={suggest} loading={busy === 'plan'}>Suggest a plan</Button>
              {plan ? (
                <ol className="mt-4 flex flex-col gap-2">
                  {plan.items.map((i) => (
                    <li key={i.taskId} className="rounded-[var(--radius)] border border-line p-3">
                      <div className="flex items-center gap-2">
                        <span className="tnum text-sm text-ink-subtle">{i.order}.</span>
                        <span className="font-medium text-ink">{i.title}</span>
                        {i.isFrog ? <Badge tone="warning"><Flame className="size-3" aria-hidden /> Frog</Badge> : null}
                      </div>
                      <p className="mt-1 text-sm text-ink-muted">{i.cycles} × {i.focusMinutes} min · {i.reasons.join(' · ') || 'Fits your time'}</p>
                    </li>
                  ))}
                  {plan.items.length === 0 ? <li className="text-sm text-ink-muted">Nothing fits — add tasks or more time.</li> : null}
                  {plan.deferred.map((d) => (
                    <li key={d.taskId} className="text-sm text-ink-muted">{d.mandatory ? <Badge tone="warning" className="mr-1">Required</Badge> : null}{d.title} — {d.reason}</li>
                  ))}
                </ol>
              ) : null}
            </CardContent>
          </Card>
        </Section>

        <Section title="End-of-day review">
          <Card>
            <CardContent className="pt-5">
              <Button variant="secondary" onClick={loadReview} loading={busy === 'review'}>Review today</Button>
              {review ? (
                <div className="mt-4 flex flex-col gap-3 text-sm">
                  <p className="text-ink">{review.totalMinutes} focused minutes today{review.frogDone === null ? '' : review.frogDone ? ' · primary frog done' : ' · primary frog not finished'}.</p>
                  {review.completed.length ? <p className="text-ink-muted">Finished: {review.completed.map((c) => c.title).join(', ')}</p> : null}
                  {review.unfinished.map((u) => (
                    <Notice key={u.taskId} tone={u.mandatory ? 'warning' : 'info'} title={u.title}>{u.suggestion}</Notice>
                  ))}
                  {!review.completed.length && !review.unfinished.length ? <p className="text-ink-muted">No frogs or focus sessions today yet.</p> : null}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </Section>
      </div>
    </div>
  )
}
