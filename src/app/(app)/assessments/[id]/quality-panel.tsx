'use client'

import * as React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type Indicator = {
  key: string
  label: string
  status: 'pass' | 'warn' | 'fail'
  detail: string
  score?: number
}

type Report = {
  overall: 'pass' | 'warn' | 'fail'
  overallLabel: string
  indicators: Indicator[]
  disclaimer: string
  questionCount: number
}

const TONE: Record<Indicator['status'], string> = {
  pass: 'text-emerald-700 bg-emerald-50',
  warn: 'text-amber-800 bg-amber-50',
  fail: 'text-red-700 bg-red-50',
}

/** Loads deterministic quality indicators for a paper. */
export function QualityCheckPanel({ assessmentId }: { assessmentId: string }) {
  const [report, setReport] = React.useState<Report | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/v1/assessments/${assessmentId}/quality`)
        const body = await res.json()
        if (!res.ok) {
          if (!cancelled) setError(body?.error?.message ?? 'Could not run quality check')
          return
        }
        if (!cancelled) setReport(body.data as Report)
      } catch {
        if (!cancelled) setError('Could not run quality check')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [assessmentId])

  if (error) {
    return (
      <Card>
        <CardContent className="py-4 text-sm text-[var(--muted)]">{error}</CardContent>
      </Card>
    )
  }

  if (!report) {
    return (
      <Card>
        <CardContent className="py-4 text-sm text-[var(--muted)]">Running quality check…</CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base">AI quality panel</CardTitle>
        <span className={cn('rounded-md px-2 py-0.5 text-xs font-medium', TONE[report.overall])}>
          {report.overallLabel}
        </span>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-2">
          {report.indicators.map((item) => (
            <li key={item.key} className="flex items-start justify-between gap-3 text-sm">
              <div>
                <p className="font-medium text-[var(--fg)]">{item.label}</p>
                <p className="text-[var(--muted)]">{item.detail}</p>
              </div>
              <span className={cn('shrink-0 rounded-md px-2 py-0.5 text-xs font-medium', TONE[item.status])}>
                {item.score != null && item.key === 'syllabus' ? `${item.score}%` : item.status}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-[var(--muted)]">{report.disclaimer}</p>
      </CardContent>
    </Card>
  )
}
