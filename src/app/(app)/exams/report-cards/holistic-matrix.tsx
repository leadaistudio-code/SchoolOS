'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Save } from 'lucide-react'
import { saveHolisticAction } from '../actions'
import { CO_SCHOLASTIC_GRADES, PROMOTION_OPTIONS, type HolisticData } from '@/lib/exams/report-card-config'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useToast } from '@/components/ui/toast'

type MatrixRow = {
  studentId: string
  rollNumber: number | null
  name: string
  admissionNo: string
  result: {
    id: string
    percentage: number
    grade: string | null
    published: boolean
    holistic: HolisticData
    teacherRemark: string
    principalRemark: string
    promotionStatus: string
  } | null
}

const cell = 'border-b border-line px-2 py-1.5 align-middle'
const select = 'h-8 rounded-md border border-line bg-surface px-1.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-[var(--brand-200)]'

/**
 * Part 2 entry for a whole section: competency scores (0–5), co-scholastic
 * grades, remarks and promotion status, saved in one go.
 */
export function HolisticMatrix({
  examId,
  competencies,
  coScholastic,
  rows: initial,
  canPrincipal,
}: {
  examId: string
  competencies: string[]
  coScholastic: string[]
  rows: MatrixRow[]
  canPrincipal: boolean
}) {
  const [rows, setRows] = useState(initial)
  const [dirty, setDirty] = useState(false)
  const [pending, start] = useTransition()
  const toast = useToast()

  const patch = (studentId: string, fn: (r: NonNullable<MatrixRow['result']>) => NonNullable<MatrixRow['result']>) => {
    setDirty(true)
    setRows((current) => current.map((row) => (row.studentId === studentId && row.result ? { ...row, result: fn(row.result) } : row)))
  }

  const save = () => {
    const payload = rows
      .filter((row) => row.result)
      .map((row) => {
        const r = row.result!
        return {
          resultId: r.id,
          competencies: Object.fromEntries(competencies.map((name) => [name, { score: r.holistic.competencies[name]?.score ?? null, note: null }])),
          coScholastic: Object.fromEntries(coScholastic.map((name) => [name, { grade: r.holistic.coScholastic[name]?.grade ?? null, note: null }])),
          teacherRemark: r.teacherRemark,
          principalRemark: r.principalRemark,
          promotionStatus: r.promotionStatus,
        }
      })
    if (payload.length === 0) return
    start(async () => {
      const result = await saveHolisticAction({ examId, rows: payload })
      toast.push({ tone: result.ok ? 'success' : 'error', title: result.message })
      if (result.ok) setDirty(false)
    })
  }

  const withResults = rows.filter((r) => r.result).length

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto scroll-thin">
        <table className="w-full min-w-max text-sm">
          <thead className="bg-surface-2 text-[11px] uppercase tracking-wide text-ink-muted">
            <tr>
              <th rowSpan={2} className="sticky left-0 z-10 bg-surface-2 px-2 py-2 text-left">Student</th>
              {competencies.length ? <th colSpan={competencies.length} className="border-l border-line px-2 py-1.5 text-center text-indigo-600">21st-century competencies (0–5)</th> : null}
              {coScholastic.length ? <th colSpan={coScholastic.length} className="border-l border-line px-2 py-1.5 text-center text-emerald-600">Co-scholastic grade</th> : null}
              <th rowSpan={2} className="border-l border-line px-2 py-2 text-left">Class teacher&apos;s observation</th>
              {canPrincipal ? <th rowSpan={2} className="px-2 py-2 text-left">Principal&apos;s remark</th> : null}
              <th rowSpan={2} className="px-2 py-2 text-left">Promotion</th>
            </tr>
            <tr>
              {competencies.map((name, i) => (
                <th key={name} title={name} className={`max-w-24 truncate px-2 py-1.5 text-center font-semibold normal-case ${i === 0 ? 'border-l border-line' : ''}`}>{name}</th>
              ))}
              {coScholastic.map((name, i) => (
                <th key={name} title={name} className={`max-w-24 truncate px-2 py-1.5 text-center font-semibold normal-case ${i === 0 ? 'border-l border-line' : ''}`}>{name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const r = row.result
              return (
                <tr key={row.studentId} className={r ? '' : 'opacity-60'}>
                  <td className={`${cell} sticky left-0 z-10 bg-surface`}>
                    {r ? (
                      <Link href={`/exams/report-cards/${r.id}`} className="block text-sm font-medium text-ink hover:text-[var(--brand-600)]">
                        {row.rollNumber ? `${row.rollNumber}. ` : ''}{row.name}
                      </Link>
                    ) : (
                      <span className="block text-sm text-ink">{row.rollNumber ? `${row.rollNumber}. ` : ''}{row.name}</span>
                    )}
                    <span className="block text-xs text-ink-subtle tnum">
                      {row.admissionNo}
                      {r ? ` · ${r.percentage}%${r.grade ? ` · ${r.grade}` : ''}` : ' · compute results first'}
                    </span>
                  </td>
                  {competencies.map((name, i) => (
                    <td key={name} className={`${cell} text-center ${i === 0 ? 'border-l' : ''}`}>
                      <select
                        aria-label={`${name} for ${row.name}`}
                        disabled={!r}
                        className={select}
                        value={r?.holistic.competencies[name]?.score ?? ''}
                        onChange={(e) => patch(row.studentId, (res) => ({
                          ...res,
                          holistic: { ...res.holistic, competencies: { ...res.holistic.competencies, [name]: { score: e.target.value === '' ? null : Number(e.target.value), note: null } } },
                        }))}
                      >
                        <option value="">—</option>
                        {[5, 4, 3, 2, 1, 0].map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </td>
                  ))}
                  {coScholastic.map((name, i) => (
                    <td key={name} className={`${cell} text-center ${i === 0 ? 'border-l' : ''}`}>
                      <select
                        aria-label={`${name} for ${row.name}`}
                        disabled={!r}
                        className={select}
                        value={r?.holistic.coScholastic[name]?.grade ?? ''}
                        onChange={(e) => patch(row.studentId, (res) => ({
                          ...res,
                          holistic: { ...res.holistic, coScholastic: { ...res.holistic.coScholastic, [name]: { grade: e.target.value || null, note: null } } },
                        }))}
                      >
                        <option value="">—</option>
                        {CO_SCHOLASTIC_GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </td>
                  ))}
                  <td className={`${cell} border-l`}>
                    <textarea
                      aria-label={`Observation for ${row.name}`}
                      disabled={!r}
                      rows={2}
                      maxLength={600}
                      value={r?.teacherRemark ?? ''}
                      onChange={(e) => patch(row.studentId, (res) => ({ ...res, teacherRemark: e.target.value }))}
                      className="w-64 rounded-md border border-line bg-surface px-2 py-1 text-xs"
                    />
                  </td>
                  {canPrincipal ? (
                    <td className={cell}>
                      <textarea
                        aria-label={`Principal remark for ${row.name}`}
                        disabled={!r}
                        rows={2}
                        maxLength={600}
                        value={r?.principalRemark ?? ''}
                        onChange={(e) => patch(row.studentId, (res) => ({ ...res, principalRemark: e.target.value }))}
                        className="w-56 rounded-md border border-line bg-surface px-2 py-1 text-xs"
                      />
                    </td>
                  ) : null}
                  <td className={cell}>
                    <input
                      aria-label={`Promotion status for ${row.name}`}
                      disabled={!r}
                      list="promotion-options"
                      maxLength={120}
                      value={r?.promotionStatus ?? ''}
                      onChange={(e) => patch(row.studentId, (res) => ({ ...res, promotionStatus: e.target.value }))}
                      placeholder="Promoted"
                      className="h-8 w-44 rounded-md border border-line bg-surface px-2 text-xs"
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <datalist id="promotion-options">
          {PROMOTION_OPTIONS.map((o) => <option key={o} value={o} />)}
        </datalist>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-3 py-2.5">
        <p className="text-sm text-ink-muted">
          {withResults} of {rows.length} students have computed results{dirty ? ' · unsaved changes' : ''}
        </p>
        <Button onClick={save} loading={pending} disabled={withResults === 0}>
          <Save aria-hidden />
          Save assessment
        </Button>
      </div>
    </Card>
  )
}
