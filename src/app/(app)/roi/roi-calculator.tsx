'use client'

import * as React from 'react'
import { ArrowLeft, ArrowRight, Presentation, Printer, RotateCcw, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { ASSUMPTIONS, SCENARIO_BLURB, SCENARIO_LABEL } from '@/lib/roi/assumptions'
import { calculateRoi, headline } from '@/lib/roi/calculator'
import { formatHours, formatInr, formatPercent } from '@/lib/roi/format'
import { roiFieldErrors, roiInputsSchema } from '@/lib/roi/validation'
import type { RoiInputs, Scenario } from '@/lib/roi/types'
import { QualitativeBenefits, RoiResults } from './roi-results'
import {
  StepAdmissionsFees,
  StepInvestment,
  StepProcesses,
  StepProfile,
  StepStaffProductivity,
  StepTechnology,
  type StepProps,
} from './roi-steps'
import { saveRoiCalculationAction } from './actions'

/**
 * The calculator shell.
 *
 * Holds the inputs, runs the engine on every keystroke, and decides what is on
 * screen. It contains no arithmetic of its own — every figure here comes back
 * from `calculateRoi`, which is why the tests can prove the numbers without
 * rendering anything.
 *
 * Two modes. The default is a six-step form for somebody filling it in
 * carefully. Presentation mode collapses the steps into one scrolling column
 * with the results pinned alongside, for a salesperson sitting next to a
 * principal who wants to see the number move as they correct a figure.
 */

const STEPS: { id: string; title: string; blurb: string; Component: React.ComponentType<StepProps> }[] = [
  {
    id: 'profile',
    title: 'Tell us about your school',
    blurb: 'Size, staffing and what those people cost.',
    Component: StepProfile,
  },
  {
    id: 'processes',
    title: 'How things are done today',
    blurb: 'Attendance, reporting and parent communication as they work now.',
    Component: StepProcesses,
  },
  {
    id: 'admissions',
    title: 'Admissions and fees',
    blurb: 'Enquiry volume, conversion and the outstanding book.',
    Component: StepAdmissionsFees,
  },
  {
    id: 'staff',
    title: 'Teacher productivity',
    blurb: 'Time going into question papers today.',
    Component: StepStaffProductivity,
  },
  {
    id: 'technology',
    title: 'What you spend on software',
    blurb: 'Current tools, and how much of it MyCampusView replaces.',
    Component: StepTechnology,
  },
  {
    id: 'investment',
    title: 'MyCampusView investment',
    blurb: 'The quoted price, so the return can be measured against it.',
    Component: StepInvestment,
  },
]

export function RoiCalculator({
  initialInputs,
  seeded,
  gaps,
  schoolName,
  generatedOn,
}: {
  initialInputs: RoiInputs
  seeded: string[]
  gaps: string[]
  schoolName: string
  /** Formatted server-side; the printed report states when it was prepared. */
  generatedOn: string
}) {
  const toast = useToast()

  const [inputs, setInputs] = React.useState<RoiInputs>(initialInputs)
  // Conservative by default. A number the school finds pessimistic and then
  // beats is worth more than one they find inflated and stop believing.
  const [scenario, setScenario] = React.useState<Scenario>('CONSERVATIVE')
  const [step, setStep] = React.useState(0)
  const [showResults, setShowResults] = React.useState(false)
  const [presenting, setPresenting] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [saveOpen, setSaveOpen] = React.useState(false)
  const [contact, setContact] = React.useState({ schoolName, contactName: '', email: '', phone: '' })

  const seededSet = React.useMemo(() => new Set(seeded), [seeded])
  const assumptions = ASSUMPTIONS[scenario]

  const set = React.useCallback(
    <K extends keyof RoiInputs>(key: K, value: RoiInputs[K]) =>
      setInputs((prev) => ({ ...prev, [key]: value })),
    [],
  )

  // Validation runs continuously but never blocks typing: a half-entered
  // number is not an error, it is somebody mid-keystroke. The messages appear
  // beside their fields and the result keeps updating from the clamped values.
  const errors = React.useMemo(() => {
    const parsed = roiInputsSchema.safeParse(inputs)
    return parsed.success ? {} : roiFieldErrors(parsed.error)
  }, [inputs])

  const result = React.useMemo(() => calculateRoi(inputs, assumptions), [inputs, assumptions])
  const head = headline(result, inputs.includeRevenueInRoi)

  const stepProps: StepProps = { inputs, set, seeded: seededSet, errors }

  const save = async () => {
    setSaving(true)
    try {
      const response = await saveRoiCalculationAction({
        ...contact,
        scenario,
        inputs,
        assumptions,
        results: result,
        netMonthlyBenefit: head.net,
        roiPercent: head.roiPercent,
      })
      toast.push({
        tone: response.ok ? 'success' : 'error',
        title: response.ok ? 'Calculation saved' : 'Could not save',
        description: response.message,
      })
      if (response.ok) setSaveOpen(false)
    } finally {
      setSaving(false)
    }
  }

  const controls = (
    <div className="no-print flex flex-wrap items-center gap-2">
      <ScenarioPicker scenario={scenario} onChange={setScenario} />
      <Button size="sm" variant="ghost" onClick={() => setPresenting((p) => !p)}>
        <Presentation aria-hidden />
        {presenting ? 'Exit presentation' : 'Presentation mode'}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setSaveOpen(true)}>
        <Save aria-hidden />
        Save
      </Button>
      <Button size="sm" variant="ghost" onClick={() => window.print()}>
        <Printer aria-hidden />
        Report
      </Button>
    </div>
  )

  /* -- Presentation mode: everything at once, results always visible ------ */
  if (presenting) {
    return (
      <div className="space-y-4">
        {controls}
        <LiveStrip result={result} head={head} />

        <div className="grid gap-4 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)] items-start">
          <div className="no-print space-y-4 xl:max-h-[calc(100vh-13rem)] xl:overflow-y-auto xl:pr-1 scroll-thin">
            {STEPS.map(({ id, title, Component }) => (
              <Card key={id}>
                <CardHeader>
                  <CardTitle>{title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Component {...stepProps} />
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="space-y-4">
            <RoiResults
              result={result}
              inputs={inputs}
              assumptions={assumptions}
              schoolName={contact.schoolName}
              generatedOn={generatedOn}
            />
            <QualitativeBenefits />
          </div>
        </div>

        <SaveDialog
          open={saveOpen}
          onClose={() => setSaveOpen(false)}
          contact={contact}
          setContact={setContact}
          onSave={save}
          saving={saving}
        />
      </div>
    )
  }

  /* -- Results ------------------------------------------------------------ */
  if (showResults) {
    return (
      <div className="space-y-4">
        <div className="no-print flex flex-wrap items-center justify-between gap-2">
          <Button size="sm" variant="secondary" onClick={() => setShowResults(false)}>
            <ArrowLeft aria-hidden />
            Change the inputs
          </Button>
          {controls}
        </div>

        <RoiResults
          result={result}
          inputs={inputs}
          assumptions={assumptions}
          schoolName={contact.schoolName}
          generatedOn={generatedOn}
        />
        <QualitativeBenefits />

        <SaveDialog
          open={saveOpen}
          onClose={() => setSaveOpen(false)}
          contact={contact}
          setContact={setContact}
          onSave={save}
          saving={saving}
        />
      </div>
    )
  }

  /* -- The stepped form --------------------------------------------------- */
  const current = STEPS[step]!
  const last = step === STEPS.length - 1

  return (
    <div className="space-y-4">
      {controls}

      {seeded.length > 0 && step === 0 ? (
        <Notice tone="info" title="Filled in from your school's records">
          {seeded.join(' · ')}. Every figure stays editable — correct anything that does not match
          how the school actually runs.
        </Notice>
      ) : null}

      {gaps.length > 0 && step === 0 ? (
        <Notice tone="warning" title="What we could not read">
          {gaps.join(' ')}
        </Notice>
      ) : null}

      <ol className="no-print flex flex-wrap gap-1.5" aria-label="Calculator steps">
        {STEPS.map((s, index) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => setStep(index)}
              aria-current={index === step ? 'step' : undefined}
              className={cn(
                'rounded-[var(--radius-sm)] border px-2.5 py-1 text-xs font-medium transition-colors',
                index === step
                  ? 'border-[var(--brand-500)] bg-[var(--brand-50)] text-[var(--brand-600)]'
                  : index < step
                    ? 'border-line-strong text-ink-muted hover:text-ink'
                    : 'border-line text-ink-subtle hover:text-ink-muted',
              )}
            >
              {index + 1}. {s.title}
            </button>
          </li>
        ))}
      </ol>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>{current.title}</CardTitle>
            <p className="mt-0.5 text-xs text-ink-subtle">{current.blurb}</p>
          </div>
          <span className="shrink-0 text-xs text-ink-subtle tnum">
            Step {step + 1} of {STEPS.length}
          </span>
        </CardHeader>
        <CardContent>
          <current.Component {...stepProps} />
        </CardContent>
      </Card>

      <LiveStrip result={result} head={head} />

      <div className="no-print flex flex-wrap items-center gap-2">
        <Button variant="secondary" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
          <ArrowLeft aria-hidden />
          Back
        </Button>

        {last ? (
          <Button onClick={() => setShowResults(true)}>
            See the full result
            <ArrowRight aria-hidden />
          </Button>
        ) : (
          <Button onClick={() => setStep((s) => s + 1)}>
            Next
            <ArrowRight aria-hidden />
          </Button>
        )}

        <Button variant="ghost" onClick={() => setInputs(initialInputs)}>
          <RotateCcw aria-hidden />
          Start over
        </Button>

        {Object.keys(errors).length > 0 ? (
          <span className="text-xs text-[var(--danger)]">
            {Object.keys(errors).length} field
            {Object.keys(errors).length === 1 ? '' : 's'} need attention
          </span>
        ) : null}
      </div>

      <SaveDialog
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        contact={contact}
        setContact={setContact}
        onSave={save}
        saving={saving}
      />
    </div>
  )
}

/**
 * The running total.
 *
 * Present on every step, because the whole point of filling this in beside a
 * principal is that they watch the number respond to their own corrections.
 */
function LiveStrip({
  result,
  head,
}: {
  result: ReturnType<typeof calculateRoi>
  head: ReturnType<typeof headline>
}) {
  const cells = [
    { label: 'Hours saved a month', value: formatHours(result.hoursSavedPerMonth) },
    { label: 'Operational value', value: formatInr(result.monthlyOperationalValue) },
    { label: 'Net monthly benefit', value: formatInr(head.net), emphasis: true },
    { label: 'ROI', value: formatPercent(head.roiPercent) },
  ]

  return (
    <div className="grid gap-px overflow-hidden rounded-[var(--radius)] border border-line bg-[var(--border)] sm:grid-cols-4">
      {cells.map((cell) => (
        <div key={cell.label} className="bg-surface px-4 py-3">
          <p className="text-xs text-ink-muted">{cell.label}</p>
          <p
            className={cn(
              'mt-0.5 text-lg font-semibold tnum',
              cell.emphasis ? 'text-[var(--brand-600)]' : 'text-ink',
            )}
          >
            {cell.value}
          </p>
        </div>
      ))}
    </div>
  )
}

function ScenarioPicker({
  scenario,
  onChange,
}: {
  scenario: Scenario
  onChange: (s: Scenario) => void
}) {
  const scenarios: Scenario[] = ['CONSERVATIVE', 'EXPECTED', 'OPTIMISTIC']

  return (
    <div className="flex items-center gap-1 rounded-[var(--radius-sm)] border border-line p-0.5">
      {scenarios.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onChange(s)}
          title={SCENARIO_BLURB[s]}
          aria-pressed={scenario === s}
          className={cn(
            'rounded-[calc(var(--radius-sm)-2px)] px-2.5 py-1 text-xs font-medium transition-colors',
            scenario === s
              ? 'bg-[var(--brand-500)] text-[var(--brand-contrast)]'
              : 'text-ink-muted hover:text-ink',
          )}
        >
          {SCENARIO_LABEL[s]}
        </button>
      ))}
    </div>
  )
}

function SaveDialog({
  open,
  onClose,
  contact,
  setContact,
  onSave,
  saving,
}: {
  open: boolean
  onClose: () => void
  contact: { schoolName: string; contactName: string; email: string; phone: string }
  setContact: React.Dispatch<
    React.SetStateAction<{ schoolName: string; contactName: string; email: string; phone: string }>
  >
  onSave: () => void
  saving: boolean
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Save this calculation"
      description="The inputs and assumptions are stored with the result, so it can be reopened and defended later."
      footer={
        <>
          <Button onClick={onSave} loading={saving} disabled={!contact.schoolName.trim()}>
            Save
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="School" htmlFor="roi-save-school" required className="sm:col-span-2">
          <Input
            id="roi-save-school"
            value={contact.schoolName}
            onChange={(e) => setContact((c) => ({ ...c, schoolName: e.target.value }))}
            autoFocus
          />
        </Field>
        <Field label="Contact name" htmlFor="roi-save-name">
          <Input
            id="roi-save-name"
            value={contact.contactName}
            onChange={(e) => setContact((c) => ({ ...c, contactName: e.target.value }))}
          />
        </Field>
        <Field label="Phone" htmlFor="roi-save-phone">
          <Input
            id="roi-save-phone"
            value={contact.phone}
            onChange={(e) => setContact((c) => ({ ...c, phone: e.target.value }))}
          />
        </Field>
        <Field label="Email" htmlFor="roi-save-email" className="sm:col-span-2">
          <Input
            id="roi-save-email"
            type="email"
            value={contact.email}
            onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))}
          />
        </Field>
      </div>
    </Dialog>
  )
}
