'use client'

import { Fragment, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Save, WandSparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Select } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import type { GeneratorData } from '@/server/modules/timetable/generator'
import { applyAction, previewAction, saveRequirementsAction, saveTeacherRuleAction } from './actions'

type Preview = Extract<Awaited<ReturnType<typeof previewAction>>, { ok: true }>['preview']
type Req = { periodsPerWeek: number | null; maxPerDay: number | null; doublePeriod: boolean }

const DAY_OPTIONS = [
  { value: 1, short: 'Mon' },
  { value: 2, short: 'Tue' },
  { value: 3, short: 'Wed' },
  { value: 4, short: 'Thu' },
  { value: 5, short: 'Fri' },
  { value: 6, short: 'Sat' },
]

const num = (v: string) => (v.trim() === '' ? null : Math.max(0, Math.floor(Number(v)) || 0))

export function TimetableGenerator({ data }: { data: GeneratorData }) {
  const teaching = data.periods.filter((p) => !p.isBreak)
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5, 6])
  return (
    <div className="space-y-6">
      <RequirementsCard data={data} weekCapacity={teaching.length * days.length} />
      <TeacherRulesCard data={data} days={days} />
      <GenerateCard data={data} days={days} setDays={setDays} />
    </div>
  )
}

function RequirementsCard({ data, weekCapacity }: { data: GeneratorData; weekCapacity: number }) {
  const toast = useToast()
  const router = useRouter()
  const initial = useMemo(() => {
    const m: Record<string, Req> = {}
    for (const c of data.classes) for (const s of c.subjects) m[s.id] = { periodsPerWeek: s.periodsPerWeek, maxPerDay: s.maxPerDay, doublePeriod: s.doublePeriod }
    return m
  }, [data])
  const [reqs, setReqs] = useState(initial)
  const [open, setOpen] = useState<string | null>(data.classes[0]?.id ?? null)
  const [pending, start] = useTransition()
  const dirty = Object.keys(reqs).filter((id) => JSON.stringify(reqs[id]) !== JSON.stringify(initial[id]))

  const set = (id: string, patch: Partial<Req>) => setReqs((r) => ({ ...r, [id]: { ...r[id]!, ...patch } }))

  function copyToAll(classId: string) {
    const source = data.classes.find((c) => c.id === classId)
    if (!source) return
    const byName = new Map(source.subjects.map((s) => [s.name.toLowerCase(), reqs[s.id]!]))
    setReqs((r) => {
      const next = { ...r }
      for (const c of data.classes) {
        if (c.id === classId) continue
        for (const s of c.subjects) {
          const v = byName.get(s.name.toLowerCase())
          if (v) next[s.id] = { ...v }
        }
      }
      return next
    })
  }

  function save() {
    start(async () => {
      const r = await saveRequirementsAction(dirty.map((id) => ({ classSubjectId: id, ...reqs[id]! })))
      toast.push({ tone: r.ok ? 'success' : 'error', title: r.ok ? 'Saved' : 'Could not save', description: r.message })
      if (r.ok) router.refresh()
    })
  }

  return (
    <Card variant="elevated">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle>1. Lessons per week</CardTitle>
          <CardDescription>
            How many periods each subject gets in a week, per section. The school week has {weekCapacity} lesson periods.
          </CardDescription>
        </div>
        <Button onClick={save} loading={pending} disabled={dirty.length === 0}>
          <Save className="size-4" aria-hidden /> Save{dirty.length ? ` (${dirty.length})` : ''}
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {data.classes.length === 0 ? <p className="text-sm text-ink-subtle">Add classes and subjects first.</p> : null}
        {data.classes.map((c) => {
          const total = c.subjects.reduce((s, x) => s + (reqs[x.id]?.periodsPerWeek ?? 0), 0)
          const unset = c.subjects.filter((x) => reqs[x.id]?.periodsPerWeek == null).length
          const isOpen = open === c.id
          return (
            <div key={c.id} className="rounded-[var(--radius-sm)] border border-line">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : c.id)}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm"
                aria-expanded={isOpen}
              >
                {isOpen ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
                <span className="font-medium text-ink">{c.name}</span>
                <span className="text-xs text-ink-subtle">
                  {c.sections.length} section{c.sections.length === 1 ? '' : 's'} · {c.subjects.length} subjects
                </span>
                <span className="ml-auto flex items-center gap-2">
                  {unset ? <Badge tone="warning">{unset} not set</Badge> : null}
                  <Badge tone={total > weekCapacity ? 'danger' : total === weekCapacity ? 'success' : 'neutral'}>
                    {total} / {weekCapacity}
                  </Badge>
                </span>
              </button>
              {isOpen ? (
                <div className="overflow-x-auto border-t border-line">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-ink-subtle">
                        <th className="px-3 py-2 font-medium">Subject</th>
                        <th className="px-3 py-2 font-medium">Teacher</th>
                        <th className="px-3 py-2 font-medium">Per week</th>
                        <th className="px-3 py-2 font-medium">Max a day</th>
                        <th className="px-3 py-2 font-medium">Double periods</th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.subjects.map((s) => {
                        const r = reqs[s.id]!
                        return (
                          <tr key={s.id} className="border-t border-line">
                            <td className="px-3 py-1.5 font-medium text-ink">{s.name}</td>
                            <td className="px-3 py-1.5 text-ink-muted">{s.teacherName ?? <span className="text-warning">No teacher</span>}</td>
                            <td className="px-3 py-1.5">
                              <Input
                                type="number"
                                min={0}
                                max={48}
                                value={r.periodsPerWeek ?? ''}
                                onChange={(e) => set(s.id, { periodsPerWeek: num(e.target.value) })}
                                aria-label={`${s.name} periods per week`}
                                className="h-8 w-20"
                              />
                            </td>
                            <td className="px-3 py-1.5">
                              <Input
                                type="number"
                                min={1}
                                max={12}
                                value={r.maxPerDay ?? ''}
                                placeholder="auto"
                                onChange={(e) => set(s.id, { maxPerDay: num(e.target.value) || null })}
                                aria-label={`${s.name} max per day`}
                                className="h-8 w-20"
                              />
                            </td>
                            <td className="px-3 py-1.5">
                              <input
                                type="checkbox"
                                checked={r.doublePeriod}
                                onChange={(e) => set(s.id, { doublePeriod: e.target.checked })}
                                aria-label={`${s.name} double periods`}
                                className="accent-[var(--color-brand)]"
                              />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  {data.classes.length > 1 ? (
                    <div className="border-t border-line px-3 py-2">
                      <Button size="sm" variant="ghost" onClick={() => copyToAll(c.id)}>
                        Copy these numbers to every class (matching subjects)
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

function TeacherRulesCard({ data, days }: { data: GeneratorData; days: number[] }) {
  const [open, setOpen] = useState<string | null>(null)
  const load = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of data.classes)
      for (const s of c.subjects) {
        if (!s.teacherId || s.periodsPerWeek == null) continue
        const sections = c.sections.filter((x) => !x.subjectIds || x.subjectIds.includes(s.id)).length
        m.set(s.teacherId, (m.get(s.teacherId) ?? 0) + s.periodsPerWeek * sections)
      }
    return m
  }, [data])
  const teaching = data.periods.filter((p) => !p.isBreak)

  return (
    <Card variant="elevated">
      <CardHeader>
        <CardTitle>2. Teacher limits</CardTitle>
        <CardDescription>Optional. Cap a teacher&apos;s lessons per day, or block periods they cannot take (part-timers, other duties).</CardDescription>
      </CardHeader>
      <CardContent>
        {data.teachers.length === 0 ? (
          <p className="text-sm text-ink-subtle">Assign teachers to class subjects first.</p>
        ) : (
          <div className="divide-y divide-line rounded-[var(--radius-sm)] border border-line">
            {data.teachers.map((t) => {
              const l = load.get(t.id) ?? 0
              const cap = Math.min(teaching.length * days.length, t.maxPerDay ? t.maxPerDay * days.length : Infinity) - t.unavailable.length
              return (
                <Fragment key={t.id}>
                  <button
                    type="button"
                    onClick={() => setOpen(open === t.id ? null : t.id)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
                    aria-expanded={open === t.id}
                  >
                    {open === t.id ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
                    <span className="font-medium text-ink">{t.name}</span>
                    <span className="ml-auto flex items-center gap-2 text-xs text-ink-subtle">
                      {t.maxPerDay ? <Badge tone="info">max {t.maxPerDay}/day</Badge> : null}
                      {t.unavailable.length ? <Badge tone="neutral">{t.unavailable.length} blocked</Badge> : null}
                      <Badge tone={l > cap ? 'danger' : 'neutral'}>{l} lessons/week</Badge>
                    </span>
                  </button>
                  {open === t.id ? <TeacherRuleEditor teacher={t} periods={teaching} days={days} /> : null}
                </Fragment>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function TeacherRuleEditor({
  teacher,
  periods,
  days,
}: {
  teacher: GeneratorData['teachers'][number]
  periods: GeneratorData['periods']
  days: number[]
}) {
  const toast = useToast()
  const router = useRouter()
  const [max, setMax] = useState<number | null>(teacher.maxPerDay)
  const [blocked, setBlocked] = useState(new Set(teacher.unavailable))
  const [pending, start] = useTransition()
  const toggle = (k: string) =>
    setBlocked((b) => {
      const n = new Set(b)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })

  return (
    <div className="space-y-3 bg-bg px-3 py-3">
      <label className="flex items-center gap-2 text-sm text-ink">
        Most lessons in a day
        <Input type="number" min={1} max={12} value={max ?? ''} placeholder="no limit" onChange={(e) => setMax(num(e.target.value) || null)} className="h-8 w-24" />
      </label>
      <div className="overflow-x-auto">
        <table className="text-xs">
          <thead>
            <tr>
              <th />
              {periods.map((p) => (
                <th key={p.id} className="px-1 py-1 font-medium text-ink-subtle">
                  {p.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAY_OPTIONS.filter((d) => days.includes(d.value)).map((d) => (
              <tr key={d.value}>
                <td className="pr-2 font-medium text-ink-muted">{d.short}</td>
                {periods.map((p) => {
                  const k = `${d.value}:${p.id}`
                  const on = blocked.has(k)
                  return (
                    <td key={p.id} className="px-1 py-0.5 text-center">
                      <button
                        type="button"
                        onClick={() => toggle(k)}
                        aria-pressed={on}
                        aria-label={`${d.short} ${p.name} ${on ? 'blocked' : 'available'}`}
                        className={cn('size-7 rounded border text-[10px]', on ? 'border-danger bg-danger-bg text-danger' : 'border-line bg-surface text-ink-subtle')}
                      >
                        {on ? '✕' : ''}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink-subtle">Click a period to block it. Blocked periods are never given to this teacher.</p>
      <Button
        size="sm"
        loading={pending}
        onClick={() =>
          start(async () => {
            const r = await saveTeacherRuleAction({ staffId: teacher.id, maxPerDay: max, unavailable: [...blocked] })
            toast.push({ tone: r.ok ? 'success' : 'error', title: r.message })
            if (r.ok) router.refresh()
          })
        }
      >
        Save limits
      </Button>
    </div>
  )
}

function GenerateCard({ data, days, setDays }: { data: GeneratorData; days: number[]; setDays: (d: number[]) => void }) {
  const toast = useToast()
  const router = useRouter()
  const allSections = data.classes.flatMap((c) => c.sections.map((s) => ({ id: s.id, label: `${c.name} ${s.name}`, classId: c.id })))
  const [picked, setPicked] = useState<Set<string>>(new Set(allSections.map((s) => s.id)))
  const [keepExisting, setKeepExisting] = useState(data.slotCount > 0)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [view, setView] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const input = () => ({ sectionIds: [...picked], keepExisting, days })

  function run() {
    setError(null)
    start(async () => {
      const r = await previewAction(input())
      if (!r.ok) {
        setError(r.message)
        setPreview(null)
        return
      }
      setPreview(r.preview)
      setView(r.preview.grid[0]?.sectionId ?? '')
    })
  }

  function apply() {
    if (!preview) return
    const replacing = !keepExisting && data.slotCount > 0
    if (replacing && !window.confirm(`This replaces the current timetable of ${picked.size} section(s) for the chosen days. Continue?`)) return
    start(async () => {
      const r = await applyAction({ ...input(), seed: preview.seed })
      toast.push({ tone: r.ok ? 'success' : 'error', title: r.ok ? 'Timetable saved' : 'Could not apply', description: r.message })
      if (r.ok) {
        setPreview(null)
        router.push('/academics/timetable')
      }
    })
  }

  const grid = preview?.grid.find((g) => g.sectionId === view)

  return (
    <Card variant="elevated">
      <CardHeader>
        <CardTitle>3. Generate</CardTitle>
        <CardDescription>
          Builds a clash-free week from the numbers above. Nothing is saved until you press Apply; other sections&apos; lessons are always
          respected.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1">
            {DAY_OPTIONS.map((d) => (
              <button
                key={d.value}
                type="button"
                aria-pressed={days.includes(d.value)}
                onClick={() => setDays(days.includes(d.value) ? days.filter((x) => x !== d.value) : [...days, d.value].sort())}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-xs',
                  days.includes(d.value) ? 'border-brand bg-brand text-brand-contrast' : 'border-line text-ink-muted',
                )}
              >
                {d.short}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={keepExisting} onChange={(e) => setKeepExisting(e.target.checked)} className="accent-[var(--color-brand)]" />
            Keep lessons already on the timetable and fill only the gaps
          </label>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium text-ink">Sections</span>
            <Button size="sm" variant="link" onClick={() => setPicked(new Set(allSections.map((s) => s.id)))}>
              All
            </Button>
            <Button size="sm" variant="link" onClick={() => setPicked(new Set())}>
              None
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {allSections.map((s) => {
              const on = picked.has(s.id)
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setPicked((p) => {
                      const n = new Set(p)
                      if (n.has(s.id)) n.delete(s.id)
                      else n.add(s.id)
                      return n
                    })
                  }
                  className={cn('rounded-[var(--radius-sm)] border px-2 py-1 text-xs', on ? 'border-brand bg-brand/10 text-ink' : 'border-line text-ink-subtle')}
                >
                  {s.label}
                </button>
              )
            })}
          </div>
        </div>

        {error ? <Notice tone="danger">{error}</Notice> : null}

        <div className="flex flex-wrap gap-2">
          <Button onClick={run} loading={pending && !preview} disabled={picked.size === 0 || days.length === 0}>
            <WandSparkles className="size-4" aria-hidden /> {preview ? 'Try again' : 'Generate preview'}
          </Button>
          {preview ? (
            <Button variant="secondary" onClick={apply} loading={pending && !!preview}>
              <CheckCircle2 className="size-4" aria-hidden /> Apply to timetable
            </Button>
          ) : null}
        </div>

        {preview ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={preview.placed === preview.wanted ? 'success' : 'warning'}>
                {preview.placed} of {preview.wanted} lessons placed
              </Badge>
              {preview.unplaced.length ? <span className="text-xs text-ink-subtle">Try again for a different arrangement, or relax a limit.</span> : null}
            </div>
            {[...preview.problems, ...(preview.missingRequirement.length ? [`No weekly count set for: ${preview.missingRequirement.join(', ')} (skipped).`] : []), ...(preview.noTeacher.length ? [`No teacher assigned for: ${preview.noTeacher.slice(0, 8).join(', ')}${preview.noTeacher.length > 8 ? '…' : ''}`] : [])].map((p) => (
              <p key={p} className="flex items-start gap-2 text-sm text-warning">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {p}
              </p>
            ))}
            {preview.unplaced.length ? (
              <div className="rounded-[var(--radius-sm)] border border-line p-3 text-sm">
                <p className="mb-1 font-medium text-ink">Could not fit</p>
                <ul className="grid gap-x-4 text-ink-muted sm:grid-cols-2">
                  {preview.unplaced.map((u) => (
                    <li key={`${u.section}-${u.subject}`}>
                      {u.section}: {u.subject} — {u.missing} lesson{u.missing === 1 ? '' : 's'}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-ink">Preview</span>
              <Select value={view} onChange={(e) => setView(e.target.value)} className="h-8 w-48" aria-label="Section to preview">
                {preview.grid.map((g) => (
                  <option key={g.sectionId} value={g.sectionId}>
                    {g.label}
                  </option>
                ))}
              </Select>
            </div>
            {grid ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-xs">
                  <thead>
                    <tr>
                      <th className="border border-line p-1.5 text-left text-ink-subtle">Period</th>
                      {preview.days.map((d) => (
                        <th key={d.value} className="border border-line p-1.5 text-ink-subtle">
                          {d.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.periods.map((p) => (
                      <tr key={p.id}>
                        <td className="border border-line p-1.5 font-medium text-ink-muted">
                          {p.name}
                          <span className="block text-[10px] font-normal text-ink-subtle">
                            {p.startTime}–{p.endTime}
                          </span>
                        </td>
                        {preview.days.map((d) => {
                          if (p.isBreak) return <td key={d.value} className="border border-line bg-bg p-1.5 text-center text-ink-subtle">Break</td>
                          const cell = grid.cells.find((c) => c.day === d.value && c.periodId === p.id)
                          return (
                            <td key={d.value} className={cn('border border-line p-1.5', cell && !cell.kept && 'bg-brand/5')}>
                              {cell ? (
                                <>
                                  <span className="block font-medium text-ink">{cell.subject}</span>
                                  <span className="block text-[10px] text-ink-subtle">
                                    {cell.teacher}
                                    {cell.kept ? ' · kept' : ''}
                                  </span>
                                </>
                              ) : (
                                <span className="text-ink-subtle">—</span>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
