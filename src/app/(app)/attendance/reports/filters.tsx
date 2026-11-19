'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Input, Select } from '@/components/ui/input'
import { PERIOD_PRESETS } from '@/lib/periods'
import { AttendanceExportMenu } from './export-menu'

type ClassNode = {
  id: string
  name: string
  sections: { id: string; name: string }[]
}

/**
 * Fees-style filter row for attendance reports: session/period, dates,
 * class → section, risk band, and CSV export.
 */
export function ReportFilters({
  classes,
  sessionName = null,
  resolvedFrom,
  resolvedTo,
}: {
  classes: ClassNode[]
  sessionName?: string | null
  /** Effective dates after session/preset resolution — used by CSV export. */
  resolvedFrom: string
  resolvedTo: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params.toString())
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    router.push(`${pathname}?${next.toString()}`)
  }
  const set = (key: string, value: string) => update({ [key]: value })

  const classId = params.get('classLevelId') ?? ''
  const sections = classes.find((c) => c.id === classId)?.sections ?? []
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''

  return (
    <>
      <Select
        value={params.get('preset') ?? (params.get('from') || params.get('to') ? 'custom' : '')}
        aria-label="Period"
        className="w-40"
        onChange={(e) =>
          e.target.value === 'custom'
            ? update({ preset: '' })
            : update({ preset: e.target.value, from: '', to: '' })
        }
      >
        <option value="">{sessionName ? `Session ${sessionName}` : 'All dates'}</option>
        {sessionName ? <option value="all">All dates</option> : null}
        {PERIOD_PRESETS.map((p) => (
          <option key={p.key} value={p.key}>
            {p.label}
          </option>
        ))}
        <option value="custom">Custom range</option>
      </Select>
      {!params.get('preset') ? (
        <>
          <Input
            type="date"
            aria-label="From date"
            className="w-36"
            value={from}
            onChange={(e) => set('from', e.target.value)}
          />
          <Input
            type="date"
            aria-label="To date"
            className="w-36"
            value={to}
            onChange={(e) => set('to', e.target.value)}
          />
        </>
      ) : null}

      <Select
        value={classId}
        aria-label="Filter by class"
        className="w-40"
        onChange={(e) => update({ classLevelId: e.target.value, sectionId: '' })}
      >
        <option value="">All classes</option>
        {classes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>

      <Select
        value={params.get('sectionId') ?? ''}
        aria-label="Filter by section"
        className="w-36"
        disabled={!classId}
        onChange={(e) => set('sectionId', e.target.value)}
      >
        <option value="">All sections</option>
        {sections.map((s) => (
          <option key={s.id} value={s.id}>
            Section {s.name}
          </option>
        ))}
      </Select>

      <Select
        value={params.get('risk') ?? ''}
        aria-label="Filter by attendance risk"
        className="w-40"
        onChange={(e) => update({ risk: e.target.value, focus: '' })}
      >
        <option value="">All students</option>
        <option value="below_85">Below 85%</option>
        <option value="below_75">Below 75% (at risk)</option>
      </Select>

      <Select
        value={params.get('focus') ?? ''}
        aria-label="Drill-down focus"
        className="w-44"
        onChange={(e) => update({ focus: e.target.value, risk: '' })}
      >
        <option value="">Any attendance</option>
        <option value="absent">Has absences</option>
        <option value="late">Has late arrivals</option>
        <option value="leave">Has leave days</option>
      </Select>

      <AttendanceExportMenu from={resolvedFrom} to={resolvedTo} />
    </>
  )
}
