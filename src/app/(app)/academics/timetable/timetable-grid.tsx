'use client'

import * as React from 'react'
import { Loader2, Plus, X } from 'lucide-react'
import type { TimetableGrid as Grid } from '@/server/modules/timetable/service'
import { setSlotAction } from './actions'
import { useToast } from '@/components/ui/toast'
import { Select } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export type SubjectOption = {
  id: string
  label: string
  teacher: string | null
}

/**
 * The weekly grid.
 *
 * Editing is cell-by-cell rather than a giant form: a timetable is built by
 * filling one slot at a time, and saving the whole grid at once would make a
 * single teacher clash reject forty valid changes. Each cell is its own
 * transaction, so a refused clash costs the user exactly that cell.
 */
export function TimetableGrid({
  grid,
  subjects,
  editable,
  readOnlyReason,
}: {
  grid: Grid & { section?: { id: string; name: string; className: string } }
  subjects: SubjectOption[]
  editable: boolean
  readOnlyReason?: string
}) {
  const toast = useToast()
  const [editing, setEditing] = React.useState<{ periodId: string; day: number } | null>(null)
  const [saving, setSaving] = React.useState<string | null>(null)

  const sectionId = grid.section?.id

  const save = async (periodId: string, day: number, classSubjectId: string) => {
    if (!sectionId) return
    const key = `${periodId}-${day}`
    setSaving(key)

    const result = await setSlotAction({
      sectionId,
      periodId,
      dayOfWeek: day,
      classSubjectId: classSubjectId || undefined,
    })

    toast.push({
      tone: result.ok ? 'success' : 'error',
      title: result.ok ? (classSubjectId ? 'Lesson set' : 'Slot cleared') : 'Could not save',
      description: result.message,
    })

    setSaving(null)
    setEditing(null)
  }

  return (
    <div>
      {!editable && readOnlyReason ? (
        <p className="px-4 py-2.5 text-[13px] text-ink-muted border-b border-line">
          {readOnlyReason}
        </p>
      ) : null}

      <div className="overflow-x-auto scroll-thin">
        <table className="w-full border-collapse min-w-[760px]">
          <thead>
            <tr>
              <th className="w-32 px-3 py-2.5 text-left text-[12px] font-semibold uppercase tracking-wide text-ink-subtle border-b border-line">
                Period
              </th>
              {grid.days.map((d) => (
                <th
                  key={d.value}
                  className="px-3 py-2.5 text-left text-[12px] font-semibold uppercase tracking-wide text-ink-subtle border-b border-line"
                >
                  {d.short}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {grid.periods.map((period) => (
              <tr key={period.id} className={cn(period.isBreak && 'bg-surface-2')}>
                <td className="px-3 py-2 align-top">
                  <span className="block text-[13px] font-medium text-ink">{period.name}</span>
                  <span className="block text-[11.5px] text-ink-subtle tnum">
                    {period.startTime}–{period.endTime}
                  </span>
                </td>

                {grid.days.map((day) => {
                  const cell = grid.cells[period.id]?.[day.value]
                  const key = `${period.id}-${day.value}`
                  const isEditing =
                    editing?.periodId === period.id && editing?.day === day.value

                  if (period.isBreak) {
                    return (
                      <td
                        key={day.value}
                        className="px-3 py-2 text-[12px] text-ink-subtle italic align-top"
                      >
                        Break
                      </td>
                    )
                  }

                  return (
                    <td key={day.value} className="px-2 py-2 align-top">
                      {isEditing ? (
                        <div className="flex items-center gap-1">
                          <Select
                            autoFocus
                            defaultValue={cell?.classSubjectId ?? ''}
                            className="h-8 text-[12px] min-w-36"
                            onChange={(e) => save(period.id, day.value, e.target.value)}
                            aria-label="Choose a subject"
                          >
                            <option value="">— free —</option>
                            {subjects.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.label}
                                {s.teacher ? ` · ${s.teacher}` : ''}
                              </option>
                            ))}
                          </Select>
                          <button
                            onClick={() => setEditing(null)}
                            className="size-7 grid place-items-center rounded text-ink-subtle hover:text-ink"
                            aria-label="Cancel"
                          >
                            <X className="size-4" aria-hidden />
                          </button>
                        </div>
                      ) : saving === key ? (
                        <div className="h-14 grid place-items-center">
                          <Loader2 className="size-4 animate-spin text-ink-subtle" aria-hidden />
                        </div>
                      ) : cell?.subject ? (
                        <button
                          disabled={!editable}
                          onClick={() => setEditing({ periodId: period.id, day: day.value })}
                          className={cn(
                            'w-full text-left rounded-lg border border-line bg-surface px-2.5 py-1.5 min-h-14',
                            editable && 'hover:border-[var(--brand-500)] hover:bg-[var(--brand-50)]',
                          )}
                        >
                          <span className="block text-[12.5px] font-medium text-ink truncate">
                            {cell.subject}
                          </span>
                          {cell.teacher ? (
                            <span className="block text-[11px] text-ink-subtle truncate">
                              {cell.teacher}
                            </span>
                          ) : null}
                          {cell.roomName ? (
                            <span className="block text-[11px] text-ink-subtle">
                              {cell.roomName}
                            </span>
                          ) : null}
                        </button>
                      ) : editable ? (
                        <button
                          onClick={() => setEditing({ periodId: period.id, day: day.value })}
                          className="w-full min-h-14 rounded-lg border border-dashed border-line text-ink-subtle hover:text-[var(--brand-600)] hover:border-[var(--brand-500)] grid place-items-center"
                          aria-label={`Add a lesson on ${day.label} in ${period.name}`}
                        >
                          <Plus className="size-4" aria-hidden />
                        </button>
                      ) : (
                        <div className="min-h-14 grid place-items-center text-[12px] text-ink-subtle">
                          —
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editable ? (
        <p className="px-4 py-3 text-[12px] text-ink-subtle border-t border-line">
          Click a slot to set or clear it. A teacher already taking another class in that period
          is refused, so the grid cannot double-book anyone.
        </p>
      ) : null}
    </div>
  )
}
