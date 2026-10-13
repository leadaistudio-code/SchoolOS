'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, Printer, Sparkles, UserMinus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input, Select } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'
import type { RankedCandidate } from '@/lib/substitutions'
import type { AwayTeacher } from '@/server/modules/substitutions/service'
import { assignAction, autoAssignAction, clearAwayAction, markAwayAction, type ActionResult } from './actions'

const REASON: Record<AwayTeacher['reason'], { label: string; tone: 'warning' | 'danger' | 'neutral' }> = {
  LEAVE: { label: 'On leave', tone: 'warning' },
  ABSENT: { label: 'Absent', tone: 'danger' },
  MANUAL: { label: 'Away', tone: 'neutral' },
}

export function DatePicker({ iso }: { iso: string }) {
  const router = useRouter()
  return (
    <label className="inline-flex items-center gap-2 text-sm text-ink-muted print:hidden">
      <CalendarDays className="size-4" aria-hidden />
      <Input
        type="date"
        value={iso}
        onChange={(e) => e.target.value && router.push(`?date=${e.target.value}`)}
        className="h-9 w-auto"
        aria-label="Date"
      />
    </label>
  )
}

function useRun() {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = useTransition()
  const run = (fn: () => Promise<ActionResult>, title: string) =>
    start(async () => {
      const r = await fn()
      toast.push({ tone: r.ok ? 'success' : 'error', title: r.ok ? title : 'Could not save', description: r.message })
      if (r.ok) router.refresh()
    })
  return { pending, run }
}

export function BoardToolbar({
  iso,
  open,
  teachers,
  awayIds,
}: {
  iso: string
  open: number
  teachers: { id: string; name: string }[]
  awayIds: string[]
}) {
  const { pending, run } = useRun()
  const [staffId, setStaffId] = useState('')
  const [note, setNote] = useState('')
  const choices = teachers.filter((t) => !awayIds.includes(t.id))

  return (
    <div className="flex flex-wrap items-end gap-2 print:hidden">
      <div className="flex flex-wrap items-end gap-2">
        <Select value={staffId} onChange={(e) => setStaffId(e.target.value)} className="h-9 w-56" aria-label="Teacher">
          <option value="">Mark a teacher away…</option>
          {choices.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Reason (optional)"
          className="h-9 w-44"
          aria-label="Reason"
        />
        <Button
          variant="secondary"
          disabled={!staffId}
          loading={pending}
          onClick={() =>
            run(async () => {
              const r = await markAwayAction(staffId, iso, note)
              if (r.ok) {
                setStaffId('')
                setNote('')
              }
              return r
            }, 'Teacher added')
          }
        >
          <UserMinus aria-hidden /> Add
        </Button>
      </div>
      <div className="ml-auto flex gap-2">
        <Button variant="secondary" onClick={() => window.print()}>
          <Printer aria-hidden /> Print cover sheet
        </Button>
        <Button disabled={open === 0} loading={pending} onClick={() => run(() => autoAssignAction(iso), 'Cover arranged')}>
          <Sparkles aria-hidden /> Auto-assign {open > 0 ? `(${open})` : ''}
        </Button>
      </div>
    </div>
  )
}

export function AwayTeacherCard({
  iso,
  teacher,
  suggestions,
  freeTeachers,
}: {
  iso: string
  teacher: AwayTeacher
  suggestions: Record<string, RankedCandidate[]>
  freeTeachers: { id: string; name: string }[]
}) {
  const { pending, run } = useRun()
  const reason = REASON[teacher.reason]

  return (
    <div className="rounded-[var(--radius)] border border-line bg-surface break-inside-avoid">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        <p className="font-medium text-ink">{teacher.name}</p>
        <Badge tone={reason.tone}>{reason.label}</Badge>
        {teacher.detail ? <span className="text-xs text-ink-subtle">{teacher.detail}</span> : null}
        <span className="ml-auto text-xs text-ink-subtle">
          {teacher.lessons.length} lesson{teacher.lessons.length === 1 ? '' : 's'}
        </span>
        {teacher.reason === 'MANUAL' ? (
          <Button
            size="icon-sm"
            variant="ghost"
            className="print:hidden"
            aria-label={`Remove ${teacher.name} from the board`}
            loading={pending}
            onClick={() => run(() => clearAwayAction(teacher.id, iso), 'Updated')}
          >
            <X aria-hidden />
          </Button>
        ) : null}
      </div>
      {teacher.lessons.length === 0 ? (
        <p className="px-4 py-3 text-sm text-ink-subtle">No lessons on this day — nothing to cover.</p>
      ) : (
        <ul className="divide-y divide-line">
          {teacher.lessons.map((l) => (
            <LessonRow
              key={`${l.sectionId}:${l.periodId}`}
              iso={iso}
              lesson={l}
              ranked={suggestions[`${l.sectionId}:${l.periodId}`] ?? []}
              freeTeachers={freeTeachers}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function LessonRow({
  iso,
  lesson,
  ranked,
  freeTeachers,
}: {
  iso: string
  lesson: AwayTeacher['lessons'][number]
  ranked: RankedCandidate[]
  freeTeachers: { id: string; name: string }[]
}) {
  const { pending, run } = useRun()
  const [choice, setChoice] = useState(ranked[0]?.id ?? '')
  const sub = lesson.substitution
  const assigned = sub?.status === 'ASSIGNED'
  const noCover = sub?.status === 'CANCELLED'
  const rankedIds = new Set(ranked.map((r) => r.id))
  const others = freeTeachers.filter((t) => !rankedIds.has(t.id))
  const top = ranked.find((r) => r.id === choice)

  const save = (substituteId: string | null, flag?: boolean) =>
    run(
      () => assignAction({ iso, sectionId: lesson.sectionId, periodId: lesson.periodId, substituteId, noCover: flag }),
      substituteId ? 'Cover assigned' : 'Updated',
    )

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-2.5">
      <div className="w-36 shrink-0">
        <p className="text-sm font-medium text-ink">{lesson.periodName}</p>
        <p className="text-xs text-ink-subtle tabular-nums">
          {lesson.startTime}–{lesson.endTime}
        </p>
      </div>
      <div className="min-w-40 flex-1">
        <p className="text-sm text-ink">{lesson.className}</p>
        <p className="text-xs text-ink-subtle">{lesson.subject ?? 'Lesson'}</p>
      </div>

      {assigned ? (
        <div className="flex items-center gap-2">
          <Badge tone="success">{sub.substituteName}</Badge>
          <Button size="sm" variant="ghost" className="print:hidden" loading={pending} onClick={() => save(null)}>
            Change
          </Button>
        </div>
      ) : noCover ? (
        <div className="flex items-center gap-2">
          <Badge tone="neutral">No cover needed</Badge>
          <Button size="sm" variant="ghost" className="print:hidden" loading={pending} onClick={() => save(null)}>
            Undo
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <div>
            <Select value={choice} onChange={(e) => setChoice(e.target.value)} className="h-8 w-52 text-sm" aria-label="Substitute">
              <option value="">Choose a teacher…</option>
              {ranked.length > 0 ? (
                <optgroup label="Suggested (free this period)">
                  {ranked.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {others.length > 0 ? (
                <optgroup label="Everyone else">
                  {others.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </Select>
            {top ? <p className="mt-0.5 text-[11px] text-ink-subtle">{top.reasons.join(' · ')}</p> : null}
            {ranked.length === 0 ? <p className="mt-0.5 text-[11px] text-warning">No teacher is free this period</p> : null}
          </div>
          <Button size="sm" disabled={!choice} loading={pending} onClick={() => save(choice)}>
            Assign
          </Button>
          <Button size="sm" variant="ghost" loading={pending} onClick={() => save(null, true)}>
            Not needed
          </Button>
        </div>
      )}
      {!assigned && !noCover ? <span className="hidden print:inline text-sm">____________</span> : null}
    </li>
  )
}

export function NoAbsences({ iso }: { iso: string }) {
  return (
    <EmptyState
      title="Everyone is in"
      description={`No teacher is on leave or marked absent for ${iso}. If someone is away without a record, add them above.`}
    />
  )
}
