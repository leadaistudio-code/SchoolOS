'use client'

import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Notice } from '@/components/ui/states'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { ASSUMPTION_NOTES, ATTENDANCE_METHOD_LABEL, SCENARIO_LABEL } from '@/lib/roi/assumptions'
import { headline } from '@/lib/roi/calculator'
import { formatHours, formatInr, formatInrCompact, formatPercent, round1 } from '@/lib/roi/format'
import type { RoiAssumptions, RoiInputs, RoiResult, TraceLine } from '@/lib/roi/types'
import { HoursChart } from './hours-chart'

/**
 * The result screen.
 *
 * Built to survive being challenged. The order is deliberate: the honest
 * headline first, then what it is made of, then the arithmetic behind every
 * line, and only then the revenue scenario — kept visually apart so nobody can
 * come away thinking it was counted when it was not.
 */

export function RoiResults({
  result,
  inputs,
  assumptions,
  schoolName,
  generatedOn,
}: {
  result: RoiResult
  inputs: RoiInputs
  assumptions: RoiAssumptions
  schoolName: string
  /** Formatted on the server, so printing cannot disagree with hydration. */
  generatedOn?: string
}) {
  const head = headline(result, inputs.includeRevenueInRoi)

  return (
    <div className="space-y-4">
      {/* The paper report needs to say whose it is and when it was run; on
          screen both are already obvious from the page around it. */}
      <div className="print-only mb-4 border-b border-line pb-3">
        <p className="text-lg font-semibold text-ink">MyCampusView — ROI estimate</p>
        <p className="text-sm text-ink-muted">
          {schoolName || 'Your school'}
          {generatedOn ? ` · prepared ${generatedOn}` : ''} · {SCENARIO_LABEL[result.scenario]}{' '}
          scenario · {inputs.profile.students} students
        </p>
      </div>

      <HeadlineCards result={result} head={head} />
      <SummarySentence result={result} inputs={inputs} schoolName={schoolName} />

      {result.notes.length > 0 ? (
        <div className="space-y-2">
          {result.notes.map((note) => (
            <Notice key={note} tone="warning">
              {note}
            </Notice>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <Card>
          <CardHeader>
            <CardTitle>Where the hours come from</CardTitle>
          </CardHeader>
          <CardContent>
            {result.hoursByArea.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-subtle">
                No time savings on these inputs.
              </p>
            ) : (
              <HoursChart data={result.hoursByArea} />
            )}
          </CardContent>
        </Card>

        <ValueBreakdown result={result} head={head} />
      </div>

      <TraceTable lines={result.lines} result={result} />
      <RevenueCard result={result} inputs={inputs} />
      <BeforeAfter inputs={inputs} />
      <AssumptionsPanel assumptions={assumptions} inputs={inputs} result={result} />

      <p className="text-xs leading-relaxed text-ink-subtle">
        ROI estimates are based on information provided by the user and configurable operational
        assumptions. Actual savings and business outcomes may vary depending on school processes,
        adoption, staffing and implementation.
      </p>
    </div>
  )
}

type Head = ReturnType<typeof headline>

function HeadlineCards({ result, head }: { result: RoiResult; head: Head }) {
  const cards = [
    {
      value: formatHours(result.hoursSavedPerMonth),
      label: 'Saved every month',
      sub: `≈ ${round1(result.workingDaysReturned)} working days returned`,
    },
    {
      value: formatInr(result.monthlyProductivityValue),
      label: 'Monthly productivity value',
      sub: 'Hours returned, priced at cost',
    },
    {
      value: formatInr(result.monthlyHardSavings),
      label: 'Direct monthly savings',
      sub: 'Software you stop paying for',
    },
    {
      value: formatInr(head.net),
      label: 'Net monthly benefit',
      sub: `After ${formatInr(result.monthlyPlatformCost)} platform cost`,
      emphasis: true,
    },
    {
      value: formatInrCompact(result.firstYearNetBenefit),
      label: 'Estimated first-year benefit',
      sub: 'After implementation',
    },
    {
      value: formatPercent(head.roiPercent),
      label: 'Estimated ROI',
      sub: head.includesRevenue ? 'Includes revenue scenario' : 'Excludes revenue scenario',
    },
    {
      value: head.paybackMonths === null ? '—' : `${round1(head.paybackMonths)} months`,
      label: 'Estimated payback',
      sub: head.paybackMonths === null ? 'No implementation cost entered' : 'On implementation cost',
    },
  ]

  return (
    <div className="grid gap-px overflow-hidden rounded-[var(--radius)] border border-line bg-[var(--border)] sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="bg-surface p-4">
          <p className="text-xs font-medium text-ink-muted">{card.label}</p>
          <p
            className={cn(
              'mt-1.5 text-2xl font-semibold tnum',
              card.emphasis ? 'text-[var(--brand-600)]' : 'text-ink',
            )}
          >
            {card.value}
          </p>
          <p className="mt-0.5 text-xs text-ink-subtle">{card.sub}</p>
        </div>
      ))}
    </div>
  )
}

/**
 * The sentence a salesperson reads out.
 *
 * Assembled entirely from computed figures. Nothing in it is written by hand,
 * so it cannot drift from the numbers on the cards above it.
 */
function SummarySentence({
  result,
  inputs,
  schoolName,
}: {
  result: RoiResult
  inputs: RoiInputs
  schoolName: string
}) {
  if (result.hoursSavedPerMonth <= 0 && result.monthlyOperationalValue <= 0) return null

  return (
    <Card>
      <CardContent>
        <p className="text-base leading-relaxed text-ink">
          Based on your inputs, MyCampusView could return approximately{' '}
          <strong className="font-semibold">{formatHours(result.hoursSavedPerMonth)}</strong> every
          month to {schoolName || 'your school'} — about{' '}
          <strong className="font-semibold">
            {round1(result.workingDaysReturned)} working days
          </strong>{' '}
          — and create an estimated{' '}
          <strong className="font-semibold">
            {formatInr(result.monthlyOperationalValue)} of monthly operational value
          </strong>
          {inputs.includeRevenueInRoi ? ' ' : ', before considering any potential admission revenue improvement'}
          . That is roughly{' '}
          <strong className="font-semibold">{formatHours(result.hoursSavedPerYear)}</strong> a year
          back into teaching, admissions and running the school.
        </p>
      </CardContent>
    </Card>
  )
}

function ValueBreakdown({ result, head }: { result: RoiResult; head: Head }) {
  const rows = [
    { label: 'Hard savings', value: result.monthlyHardSavings, tone: 'success' as const },
    { label: 'Productivity value', value: result.monthlyProductivityValue, tone: 'brand' as const },
    ...(head.includesRevenue
      ? [{ label: 'Revenue opportunity', value: result.revenue.monthlyOpportunity, tone: 'warning' as const }]
      : []),
    { label: 'MyCampusView cost', value: -result.monthlyPlatformCost, tone: 'danger' as const },
  ]

  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 1)

  return (
    <Card className="card-print">
      <CardHeader>
        <CardTitle>What makes up the number</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map((row) => (
          <div key={row.label}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-ink">{row.label}</span>
              <span
                className={cn(
                  'text-sm font-medium tnum',
                  row.value < 0 ? 'text-[var(--danger)]' : 'text-ink',
                )}
              >
                {formatInr(row.value)}
              </span>
            </div>
            <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-surface-2">
              <span
                style={{ width: `${(Math.abs(row.value) / max) * 100}%` }}
                className={cn(
                  row.tone === 'success' && 'bg-success',
                  row.tone === 'brand' && 'bg-[var(--brand-500)]',
                  row.tone === 'warning' && 'bg-warning',
                  row.tone === 'danger' && 'bg-[var(--danger)]',
                )}
              />
            </div>
          </div>
        ))}

        <div className="flex items-baseline justify-between gap-3 border-t border-line pt-3">
          <span className="text-sm font-medium text-ink">Net monthly benefit</span>
          <span className="text-lg font-semibold tnum text-[var(--brand-600)]">
            {formatInr(head.net)}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

const CATEGORY_LABEL: Record<TraceLine['category'], string> = {
  HARD: 'Hard saving',
  PRODUCTIVITY: 'Productivity',
  REVENUE: 'Revenue scenario',
  COST: 'Cost',
}

const CATEGORY_TONE: Record<TraceLine['category'], 'success' | 'brand' | 'warning' | 'danger'> = {
  HARD: 'success',
  PRODUCTIVITY: 'brand',
  REVENUE: 'warning',
  COST: 'danger',
}

/**
 * Every rupee, traced.
 *
 * This table is the reason the calculator can be used in front of a school
 * owner. "How did you get ₹72,300?" is answered by opening a row and reading
 * the arithmetic with their own numbers in it.
 */
function TraceTable({ lines, result }: { lines: TraceLine[]; result: RoiResult }) {
  const [open, setOpen] = React.useState<string | null>(null)

  if (lines.length === 0) return null

  return (
    <Card className="overflow-hidden card-print">
      <CardHeader>
        <CardTitle>Every figure, and where it came from</CardTitle>
        <span className="text-xs text-ink-subtle">
          Hourly cost — teacher {formatInr(result.hourly.teacher)}, admin {formatInr(result.hourly.admin)},
          counsellor {formatInr(result.hourly.counsellor)}
        </span>
      </CardHeader>

      <TableWrap>
        <Table>
          <THead>
            <tr>
              <TH>Line</TH>
              <TH>Module</TH>
              <TH>Type</TH>
              <TH align="right">Hours</TH>
              <TH align="right">₹ / month</TH>
              <TH align="right">Working</TH>
            </tr>
          </THead>
          <TBody>
            {lines.map((line) => {
              const expanded = open === line.id
              return (
                <React.Fragment key={line.id}>
                  <TR>
                    <TD className="font-medium text-ink">{line.label}</TD>
                    <TD>{line.module}</TD>
                    <TD>
                      <Badge tone={CATEGORY_TONE[line.category]}>{CATEGORY_LABEL[line.category]}</Badge>
                    </TD>
                    <TD align="right">{line.hours ? formatHours(line.hours) : '—'}</TD>
                    <TD align="right" className={cn('font-medium', line.amount < 0 && 'text-[var(--danger)]')}>
                      {formatInr(line.amount)}
                    </TD>
                    <TD align="right">
                      <button
                        type="button"
                        onClick={() => setOpen(expanded ? null : line.id)}
                        aria-expanded={expanded}
                        className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-ink"
                      >
                        {expanded ? 'Hide' : 'Show'}
                        <ChevronDown
                          className={cn('size-3.5 transition-transform', expanded && 'rotate-180')}
                          aria-hidden
                        />
                      </button>
                    </TD>
                  </TR>
                  {expanded ? (
                    <tr className="bg-surface-2">
                      <td colSpan={6} className="px-4 py-3">
                        <p className="font-mono text-xs leading-relaxed text-ink">{line.formula}</p>
                        <p className="mt-1.5 text-xs text-ink-subtle">{line.basis}</p>
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              )
            })}
          </TBody>
        </Table>
      </TableWrap>

      <div className="flex items-baseline justify-between gap-3 border-t border-line px-4 py-3">
        <span className="text-sm font-medium text-ink">
          Hard savings + productivity, before platform cost
        </span>
        <span className="text-base font-semibold tnum text-ink">
          {formatInr(result.monthlyOperationalValue)}
        </span>
      </div>
    </Card>
  )
}

function RevenueCard({ result, inputs }: { result: RoiResult; inputs: RoiInputs }) {
  const r = result.revenue
  if (r.annualEnrolmentValue <= 0 && r.feeAcceleration <= 0) return null

  return (
    <Card className="border-[color-mix(in_srgb,var(--warning)_35%,transparent)]">
      <CardHeader>
        <CardTitle>Revenue opportunity — scenario estimate, not guaranteed</CardTitle>
        {inputs.includeRevenueInRoi ? (
          <Badge tone="warning">Counted in the ROI above</Badge>
        ) : (
          <Badge tone="neutral">Not counted in the ROI above</Badge>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-2xl font-semibold tnum text-ink">
              {formatInrCompact(r.annualEnrolmentValue)}
            </p>
            <p className="text-xs text-ink-muted">Potential annual admission revenue protected</p>
            <p className="mt-0.5 text-xs text-ink-subtle">
              {formatInr(r.monthlyEquivalent)} monthly equivalent
            </p>
          </div>
          <div>
            <p className="text-2xl font-semibold tnum text-ink">{round1(r.recoverableAdmissions)}</p>
            <p className="text-xs text-ink-muted">Admissions a month it assumes are recoverable</p>
            <p className="mt-0.5 text-xs text-ink-subtle">
              from {round1(r.leadsAtRisk)} enquiries at risk
            </p>
          </div>
          <div>
            <p className="text-2xl font-semibold tnum text-ink">{formatInr(r.feeAcceleration)}</p>
            <p className="text-xs text-ink-muted">Overdue fees collected sooner</p>
            <p className="mt-0.5 text-xs text-ink-subtle">Cash-flow timing, not new income</p>
          </div>
        </div>

        <Notice tone="warning">
          Based on your enquiry volume, estimated follow-up leakage and conservative conversion
          assumptions. This is a scenario estimate, not guaranteed revenue. Your school already owns
          the overdue fees — systematic chasing changes when they arrive, not whether they are owed.
        </Notice>
      </CardContent>
    </Card>
  )
}

/**
 * Before and after.
 *
 * Every right-hand entry names a module that exists in this application today.
 * Nothing aspirational appears here — a claim on this table is checkable by
 * opening the product in the next tab.
 */
function BeforeAfter({ inputs }: { inputs: RoiInputs }) {
  const rows = [
    {
      current: `Attendance on ${ATTENDANCE_METHOD_LABEL[inputs.attendance.method].toLowerCase()}`,
      next: 'Attendance marked in the app, absentees visible the same morning',
    },
    { current: 'Follow-up lists in Excel and WhatsApp', next: 'Admissions CRM with stages, owners and reminders' },
    { current: 'Outstanding fees reconciled by hand', next: 'Live outstanding ledger with receipts against invoices' },
    { current: 'Reports compiled on request', next: 'Live dashboards and reports' },
    { current: 'Management asks teams for numbers', next: 'Management asks the assistant directly' },
    { current: 'Question papers written from scratch', next: 'Papers assembled from a question bank against a blueprint' },
    { current: 'Parents called one at a time', next: 'Announcements, notices and structured feedback' },
    { current: 'Several disconnected tools', next: 'One platform, one student record' },
  ]

  return (
    <Card className="overflow-hidden card-print">
      <CardHeader>
        <CardTitle>Today, and with MyCampusView</CardTitle>
      </CardHeader>
      <TableWrap>
        <Table>
          <THead>
            <tr>
              <TH>Current process</TH>
              <TH>With MyCampusView</TH>
            </tr>
          </THead>
          <TBody>
            {rows.map((row) => (
              <TR key={row.current}>
                <TD>{row.current}</TD>
                <TD className="text-ink">{row.next}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </TableWrap>
    </Card>
  )
}

function AssumptionsPanel({
  assumptions,
  inputs,
  result,
}: {
  assumptions: RoiAssumptions
  inputs: RoiInputs
  result: RoiResult
}) {
  const values: Record<string, string> = {
    attendanceEfficiency: `${Math.round((assumptions.attendanceEfficiency[inputs.attendance.method] ?? 0) * 100)}% (${ATTENDANCE_METHOD_LABEL[inputs.attendance.method]})`,
    crmAdminEfficiency: `${Math.round(assumptions.crmAdminEfficiency * 100)}%`,
    feeAdminEfficiency: `${Math.round(assumptions.feeAdminEfficiency * 100)}%`,
    reportingEfficiency: `${Math.round(assumptions.reportingEfficiency * 100)}%`,
    questionPaperEfficiency: `${Math.round(assumptions.questionPaperEfficiency * 100)}%`,
    communicationEfficiency: `${Math.round(assumptions.communicationEfficiency * 100)}%`,
    leadRecoveryRate: `${Math.round(assumptions.leadRecoveryRate * 100)}%`,
    unknownLeakage: `${Math.round(assumptions.unknownLeakage * 100)}%`,
    feeAccelerationRate: `${Math.round(assumptions.feeAccelerationRate * 100)}%`,
  }

  return (
    <Card className="card-print">
      <CardHeader>
        <CardTitle>Calculation assumptions</CardTitle>
        <Badge tone="neutral">{SCENARIO_LABEL[result.scenario]} scenario</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-ink-subtle">
          These are default estimates, not validated industry benchmarks — MyCampusView has no
          multi-school dataset behind them yet. They are shown so you can argue with them.
        </p>

        <dl className="divide-y divide-[var(--border)]">
          <div className="flex flex-wrap items-baseline justify-between gap-2 py-2">
            <dt className="text-sm text-ink">Working pattern</dt>
            <dd className="text-sm tnum text-ink-muted">
              {inputs.working.daysPerMonth} days × {inputs.working.hoursPerDay} hrs ·{' '}
              {inputs.working.schoolDaysPerMonth} school days
            </dd>
          </div>

          {ASSUMPTION_NOTES.map((note) => (
            <div key={note.key} className="py-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <dt className="text-sm text-ink">{note.label}</dt>
                <dd className="text-sm font-medium tnum text-ink">{values[note.key] ?? '—'}</dd>
              </div>
              <p className="mt-0.5 text-xs text-ink-subtle">{note.note}</p>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}

/** The things the arithmetic cannot reach. Marked plainly as unquantified. */
export function QualitativeBenefits() {
  const items = [
    'Faster management decisions, because the numbers are already there',
    'Fewer missed follow-ups — every enquiry has an owner and a next date',
    'Accountability: who did what, and when, is on the record',
    'One place parents are spoken to, instead of several',
    'Less dependence on the one person who knows where the spreadsheet is',
    'Centralised school data that survives staff turnover',
  ]

  return (
    <Card className="card-print">
      <CardHeader>
        <CardTitle>Beyond the numbers</CardTitle>
        <Badge tone="neutral">Not counted in the ROI</Badge>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-sm text-ink-muted">
          Real benefits that cannot be honestly priced, so they are excluded from every figure above.
        </p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {items.map((item) => (
            <li key={item} className="flex gap-2 text-sm text-ink">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--brand-500)]" aria-hidden />
              {item}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
