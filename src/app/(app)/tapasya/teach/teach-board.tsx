'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, Section } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/states'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { useToast } from '@/components/ui/toast'
import { api } from '../_components/api'
import { CheckRow } from '../_components/check-row'

type ProgressRow = {
  studentId: string
  name: string
  rollNumber: string | number | null
  section: string
  sectionId: string
  assigned: number
  done: number
  overdue: number
  focusMinutesThisWeek: number
  completedIntervalsThisWeek: number
}
type Assigned = { id: string; title: string; dueOn: string | null; isMandatory: boolean; status: string; student: string; createdAt: string }
type Limits = { minFocusMinutes: number; maxFocusMinutes: number; minBreakMinutes: number; maxBreakMinutes: number }

const blankForm = { title: '', subject: '', teacherInstructions: '', estimatedMinutes: 25, dueOn: '', isMandatory: false, studentCanEdit: false, requiredFocusMinutes: '', requiredBreakMinutes: '' }

export function TeachBoard({ progress, assigned, limits, enabled }: { progress: ProgressRow[]; assigned: Assigned[]; limits: Limits; enabled: boolean }) {
  const router = useRouter()
  const { push } = useToast()
  const sections = React.useMemo(() => [...new Map(progress.map((p) => [p.sectionId, p.section])).entries()], [progress])
  const [sectionId, setSectionId] = React.useState(sections[0]?.[0] ?? '')
  const rows = progress.filter((p) => !sectionId || p.sectionId === sectionId)
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [form, setForm] = React.useState(blankForm)
  const [busy, setBusy] = React.useState(false)

  const set = <K extends keyof typeof blankForm>(k: K, v: (typeof blankForm)[K]) => setForm((f) => ({ ...f, [k]: v }))
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.studentId))

  function toggleAll() {
    setSelected((s) => {
      const next = new Set(s)
      for (const r of rows) {
        if (allSelected) next.delete(r.studentId)
        else next.add(r.studentId)
      }
      return next
    })
  }

  async function assign(e: React.FormEvent) {
    e.preventDefault()
    if (!selected.size) return push({ tone: 'error', title: 'Choose at least one student' })
    setBusy(true)
    try {
      const res = await api<{ created: number }>('/api/v1/tapasya/teacher/tasks', {
        method: 'POST',
        body: {
          title: form.title,
          subject: form.subject || null,
          category: 'TEACHER_GOAL',
          teacherInstructions: form.teacherInstructions || null,
          estimatedMinutes: Number(form.estimatedMinutes),
          dueOn: form.dueOn || null,
          isMandatory: form.isMandatory,
          studentCanEdit: form.studentCanEdit,
          requiredFocusMinutes: form.requiredFocusMinutes ? Number(form.requiredFocusMinutes) : null,
          requiredBreakMinutes: form.requiredBreakMinutes ? Number(form.requiredBreakMinutes) : null,
          studentIds: [...selected],
        },
      })
      push({ tone: 'success', title: `Assigned to ${res.created} student${res.created === 1 ? '' : 's'}` })
      setForm(blankForm)
      setSelected(new Set())
      router.refresh()
    } catch (err) {
      push({ tone: 'error', title: 'Could not assign', description: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  async function withdraw(t: Assigned) {
    if (!window.confirm(`Withdraw "${t.title}" from ${t.student}? Their focus history stays.`)) return
    try {
      await api(`/api/v1/tapasya/teacher/tasks/${t.id}`, { method: 'DELETE' })
      push({ tone: 'success', title: 'Task withdrawn' })
      router.refresh()
    } catch (err) {
      push({ tone: 'error', title: 'Could not withdraw', description: (err as Error).message })
    }
  }

  const open = assigned.filter((a) => a.status !== 'CANCELLED')

  return (
    <div className="grid gap-5 [&>*]:min-w-0 xl:grid-cols-[1.4fr_1fr]">
      <Section
        title="This week"
        description="Focus minutes count completed and partial intervals; tasks show those you assigned."
        actions={sections.length > 1 ? (
          <Select aria-label="Class" value={sectionId} onChange={(e) => { setSectionId(e.target.value); setSelected(new Set()) }}>
            {sections.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </Select>
        ) : null}
      >
        {rows.length === 0 ? (
          <Card><EmptyState title="No students" description="Students in classes you teach will appear here." /></Card>
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <TR>
                  <TH className="w-8"><input type="checkbox" aria-label="Select all" checked={allSelected} onChange={toggleAll} /></TH>
                  <TH>Student</TH><TH className="text-right">Focus</TH><TH className="text-right">Intervals</TH><TH className="text-right">Tasks done</TH><TH className="text-right">Overdue</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={r.studentId}>
                    <TD>
                      <input
                        type="checkbox"
                        aria-label={`Select ${r.name}`}
                        checked={selected.has(r.studentId)}
                        onChange={() => setSelected((s) => { const n = new Set(s); if (n.has(r.studentId)) n.delete(r.studentId); else n.add(r.studentId); return n })}
                      />
                    </TD>
                    <TD>{r.rollNumber ? <span className="mr-2 text-ink-subtle tnum">{r.rollNumber}</span> : null}{r.name}</TD>
                    <TD className="text-right tnum">{r.focusMinutesThisWeek} min</TD>
                    <TD className="text-right tnum">{r.completedIntervalsThisWeek}</TD>
                    <TD className="text-right tnum">{r.done}/{r.assigned}</TD>
                    <TD className="text-right tnum">{r.overdue ? <Badge tone="warning">{r.overdue}</Badge> : 0}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Section>

      <div className="space-y-5">
        <Section title="Assign a study task" description={`${selected.size} student${selected.size === 1 ? '' : 's'} selected`}>
          <Card>
            <CardContent className="pt-5">
              <form className="space-y-3" onSubmit={assign}>
                <Field htmlFor="tt-task" label="Task" required><Input id="tt-task" value={form.title} onChange={(e) => set('title', e.target.value)} maxLength={120} required /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field htmlFor="tt-subject" label="Subject"><Input id="tt-subject" value={form.subject} onChange={(e) => set('subject', e.target.value)} maxLength={60} /></Field>
                  <Field htmlFor="tt-due" label="Due"><Input id="tt-due" type="date" value={form.dueOn} onChange={(e) => set('dueOn', e.target.value)} /></Field>
                </div>
                <Field htmlFor="tt-instructions" label="Instructions"><Textarea id="tt-instructions" rows={3} value={form.teacherInstructions} onChange={(e) => set('teacherInstructions', e.target.value)} maxLength={2000} /></Field>
                <div className="grid grid-cols-3 gap-3">
                  <Field htmlFor="tt-estimate" label="Estimate (min)"><Input id="tt-estimate" type="number" min={5} max={600} value={form.estimatedMinutes} onChange={(e) => set('estimatedMinutes', Number(e.target.value))} /></Field>
                  <Field htmlFor="tt-focus" label="Focus (min)" hint={`${limits.minFocusMinutes}–${limits.maxFocusMinutes}`}><Input id="tt-focus" type="number" min={limits.minFocusMinutes} max={limits.maxFocusMinutes} placeholder="Any" value={form.requiredFocusMinutes} onChange={(e) => set('requiredFocusMinutes', e.target.value)} /></Field>
                  <Field htmlFor="tt-break" label="Break (min)" hint={`${limits.minBreakMinutes}–${limits.maxBreakMinutes}`}><Input id="tt-break" type="number" min={limits.minBreakMinutes} max={limits.maxBreakMinutes} placeholder="Any" value={form.requiredBreakMinutes} onChange={(e) => set('requiredBreakMinutes', e.target.value)} /></Field>
                </div>
                <CheckRow label="Required — students cannot delete or reschedule it" checked={form.isMandatory} onChange={(e) => set('isMandatory', e.target.checked)} />
                <CheckRow label="Let students edit the title and estimate" checked={form.studentCanEdit} onChange={(e) => set('studentCanEdit', e.target.checked)} />
                <Button type="submit" loading={busy} disabled={!enabled || !form.title.trim() || !selected.size}>Assign</Button>
              </form>
            </CardContent>
          </Card>
        </Section>

        <Section title="Assigned tasks" description={`${open.length} open`}>
          {open.length === 0 ? (
            <Card><EmptyState title="Nothing assigned yet" description="Tasks you assign show up in each student's planner." /></Card>
          ) : (
            <Card>
              <CardContent className="pt-3">
                <ul className="divide-y divide-[var(--border)] text-sm">
                  {open.slice(0, 50).map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center gap-2 py-2">
                      <span className="text-ink">{t.title}</span>
                      <span className="text-ink-muted">{t.student}</span>
                      {t.isMandatory ? <Badge tone="warning">Required</Badge> : null}
                      <Badge tone={t.status === 'DONE' ? 'success' : 'neutral'}>{t.status === 'DONE' ? 'Done' : t.status === 'IN_PROGRESS' ? 'In progress' : 'To do'}</Badge>
                      {t.dueOn ? <span className="text-xs text-ink-subtle">due {t.dueOn}</span> : null}
                      {t.status !== 'DONE' ? <Button className="ml-auto" size="sm" variant="ghost" onClick={() => withdraw(t)}>Withdraw</Button> : null}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </Section>
      </div>
    </div>
  )
}
