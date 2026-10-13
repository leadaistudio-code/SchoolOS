'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDownWideNarrow, Plus, Save, Trash2, X } from 'lucide-react'
import { saveGradingScaleAction } from '../actions'
import { Button, IconButton } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { SYSTEM_META, type GradingBasis, type GradingSystem } from '@/lib/exams/grading-systems'

type Band = { key: number; grade: string; min: string; max: string; points: string; remark: string; isPass: boolean }

export type ScaleDraft = {
  id?: string
  name: string
  description: string
  isDefault: boolean
  system: GradingSystem
  basis: GradingBasis
  outOf: string
  passRule: PassRule
  passPercent: string
  bands: Array<Omit<Band, 'key'>>
}

export type PassRule = 'ALL_PAPERS' | 'OVERALL'

export const PASS_RULE_LABELS: Record<PassRule, string> = {
  ALL_PAPERS: 'Pass band and pass marks in every paper',
  OVERALL: 'Overall percentage only',
}

type Preset = { label: string; system: GradingSystem; basis: GradingBasis; outOf?: number; bands: Array<[string, number, number, number | null, string, boolean]> }

const PRESETS: Record<string, Preset> = {
  cbse9: {
    label: 'CBSE 9-point (A1 – E)',
    system: 'GRADES',
    basis: 'PERCENT',
    bands: [
      ['A1', 91, 100, 10, 'Outstanding', true],
      ['A2', 81, 90.99, 9, 'Excellent', true],
      ['B1', 71, 80.99, 8, 'Very good', true],
      ['B2', 61, 70.99, 7, 'Good', true],
      ['C1', 51, 60.99, 6, 'Above average', true],
      ['C2', 41, 50.99, 5, 'Average', true],
      ['D', 33, 40.99, 4, 'Pass', true],
      ['E', 0, 32.99, 0, 'Needs improvement', false],
    ],
  },
  simple: {
    label: 'Simple A+ – D',
    system: 'GRADES',
    basis: 'PERCENT',
    bands: [
      ['A+', 90, 100, 10, '', true],
      ['A', 75, 89.99, 9, '', true],
      ['B', 60, 74.99, 8, '', true],
      ['C', 33, 59.99, 6, '', true],
      ['D', 0, 32.99, 0, '', false],
    ],
  },
  gpa4: {
    label: 'GPA 4.0',
    system: 'POINTS',
    basis: 'PERCENT',
    bands: [
      ['A', 90, 100, 4, '', true],
      ['B', 80, 89.99, 3, '', true],
      ['C', 70, 79.99, 2, '', true],
      ['D', 60, 69.99, 1, '', true],
      ['F', 0, 59.99, 0, '', false],
    ],
  },
  descriptive: {
    label: 'Descriptive (primary)',
    system: 'DESCRIPTIVE',
    basis: 'PERCENT',
    bands: [
      ['Outstanding', 90, 100, null, '', true],
      ['Excellent', 75, 89.99, null, '', true],
      ['Very good', 60, 74.99, null, '', true],
      ['Good', 45, 59.99, null, '', true],
      ['Satisfactory', 33, 44.99, null, '', true],
      ['Needs improvement', 0, 32.99, null, '', false],
    ],
  },
  marks50: {
    label: 'Marks out of 50',
    system: 'GRADES',
    basis: 'MARKS',
    outOf: 50,
    bands: [
      ['A', 41, 50, null, '', true],
      ['B', 31, 40, null, '', true],
      ['C', 21, 30, null, '', true],
      ['D', 17, 20, null, '', true],
      ['E', 0, 16, null, '', false],
    ],
  },
  passfail: {
    label: 'Marks only — pass at 33%',
    system: 'MARKS_ONLY',
    basis: 'PERCENT',
    bands: [
      ['Pass', 33, 100, null, '', true],
      ['Fail', 0, 32.99, null, '', false],
    ],
  },
}

let nextKey = 1
const keyed = (bands: ScaleDraft['bands']): Band[] => bands.map((b) => ({ ...b, key: nextKey++ }))
const fromPreset = (p: Preset): ScaleDraft['bands'] =>
  p.bands.map(([grade, min, max, points, remark, isPass]) => ({ grade, min: String(min), max: String(max), points: points === null ? '' : String(points), remark, isPass }))

export const EMPTY_SCALE: ScaleDraft = {
  name: '',
  description: '',
  isDefault: false,
  system: 'GRADES',
  basis: 'PERCENT',
  outOf: '',
  passRule: 'ALL_PAPERS',
  passPercent: '33',
  bands: fromPreset(PRESETS.cbse9!),
}

function round2(n: number) {
  return String(Math.round(n * 100) / 100)
}

/** Full editor for a school's own marking system. */
export function GradeScaleForm({ initial = EMPTY_SCALE, mode = 'create' }: { initial?: ScaleDraft; mode?: 'create' | 'edit' | 'copy' }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = React.useTransition()
  const [name, setName] = React.useState(initial.name)
  const [description, setDescription] = React.useState(initial.description)
  const [isDefault, setIsDefault] = React.useState(initial.isDefault)
  const [system, setSystem] = React.useState<GradingSystem>(initial.system)
  const [basis, setBasis] = React.useState<GradingBasis>(initial.basis)
  const [outOf, setOutOf] = React.useState(initial.outOf)
  const [passRule, setPassRule] = React.useState<PassRule>(initial.passRule)
  const [passPercent, setPassPercent] = React.useState(initial.passPercent)
  const [bands, setBands] = React.useState<Band[]>(() => keyed(initial.bands))
  const [errors, setErrors] = React.useState<Record<string, string>>({})

  const ceiling = basis === 'MARKS' ? Number(outOf) || 0 : 100
  const unit = basis === 'MARKS' ? 'marks' : '%'
  const showPoints = system === 'GRADES' || system === 'POINTS'
  const showRemark = system !== 'MARKS_ONLY'

  const applyPreset = (key: string) => {
    const preset = PRESETS[key]
    if (!preset) return
    setSystem(preset.system)
    setBasis(preset.basis)
    setOutOf(preset.outOf ? String(preset.outOf) : '')
    setBands(keyed(fromPreset(preset)))
    setErrors({})
  }

  // Switching between % and marks rescales the bands instead of leaving them meaningless.
  const changeBasis = (next: GradingBasis, nextOutOf = outOf) => {
    const total = Number(nextOutOf)
    if (next !== basis && total > 0) {
      const factor = next === 'MARKS' ? total / 100 : 100 / total
      setBands((rows) => rows.map((b) => ({ ...b, min: b.min === '' ? '' : round2(Number(b.min) * factor), max: b.max === '' ? '' : round2(Number(b.max) * factor) })))
    }
    setBasis(next)
  }

  const update = (key: number, patch: Partial<Band>) => setBands((rows) => rows.map((b) => (b.key === key ? { ...b, ...patch } : b)))
  const addBand = () => {
    const lowest = [...bands].sort((a, b) => Number(a.min) - Number(b.min))[0]
    const top = lowest ? Math.max(0, Number(lowest.min) - (basis === 'MARKS' ? 1 : 0.01)) : ceiling
    setBands((rows) => [...rows, { key: nextKey++, grade: '', min: '0', max: round2(top), points: '', remark: '', isPass: false }])
  }
  const sortBands = () => setBands((rows) => [...rows].sort((a, b) => Number(b.min) - Number(a.min)))

  const warnings = React.useMemo(() => {
    const list: string[] = []
    const sorted = bands.filter((b) => b.min !== '' && b.max !== '').map((b) => ({ ...b, lo: Number(b.min), hi: Number(b.max) })).sort((a, b) => a.lo - b.lo)
    if (sorted.length && sorted[0]!.lo > 0) list.push(`Scores below ${sorted[0]!.lo}${unit === '%' ? '%' : ' marks'} get no band.`)
    if (sorted.length && ceiling && sorted[sorted.length - 1]!.hi < ceiling) list.push(`Scores above ${sorted[sorted.length - 1]!.hi} up to ${ceiling} get no band.`)
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i]!.lo <= sorted[i - 1]!.hi) list.push(`${sorted[i]!.grade || 'A band'} overlaps ${sorted[i - 1]!.grade || 'another band'}.`)
    }
    if (!bands.some((b) => b.isPass)) list.push('No band counts as a pass — every student would fail.')
    return list
  }, [bands, ceiling, unit])

  const submit = () =>
    startTransition(async () => {
      const result = await saveGradingScaleAction(mode === 'edit' ? initial.id ?? null : null, {
        name,
        description,
        isDefault,
        system,
        basis,
        outOf: basis === 'MARKS' ? outOf : null,
        passRule,
        passPercent: passPercent === '' ? 33 : passPercent,
        bands: bands.map(({ grade, min, max, points, remark, isPass }) => ({ grade, min, max, points: showPoints ? points : '', remark: showRemark ? remark : '', isPass })),
      })
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {})
        toast.push({ tone: 'error', title: 'Could not save the scale', description: result.message })
        return
      }
      setErrors({})
      toast.push({ tone: 'success', title: 'Grading scale saved', description: result.message })
      if (mode === 'create') {
        setName('')
        setDescription('')
        setBands(keyed(fromPreset(PRESETS.cbse9!)))
      }
      router.push('/exams/grades')
      router.refresh()
    })

  const bandError = (index: number) =>
    errors[`bands.${index}`] ?? errors[`bands.${index}.grade`] ?? errors[`bands.${index}.max`] ?? errors[`bands.${index}.min`]

  return (
    <Card className="xl:sticky xl:top-4">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>{mode === 'edit' ? `Edit ${initial.name}` : mode === 'copy' ? 'Copy of scale' : 'New marking system'}</CardTitle>
        {mode !== 'create' ? (
          <IconButton label="Cancel editing" onClick={() => router.push('/exams/grades')}>
            <X className="size-4" aria-hidden />
          </IconButton>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <Field label="Start from a template" htmlFor="scale-preset" hint="Fills the bands below — then change anything">
          <Select id="scale-preset" defaultValue="" onChange={(e) => { applyPreset(e.target.value); e.target.value = '' }}>
            <option value="">Choose a template…</option>
            {Object.entries(PRESETS).map(([key, p]) => (
              <option key={key} value={key}>{p.label}</option>
            ))}
          </Select>
        </Field>

        <Field label="Name" htmlFor="scale-name" required error={errors.name}>
          <Input id="scale-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Primary descriptive scale" maxLength={60} />
        </Field>

        <div>
          <p className="caption mb-1.5">Marking system</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {(Object.keys(SYSTEM_META) as GradingSystem[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setSystem(key)}
                aria-pressed={system === key}
                className={cn(
                  'rounded-[var(--radius-sm)] border p-2.5 text-left transition-colors',
                  system === key ? 'border-[var(--brand-500)] bg-[var(--brand-50)]' : 'border-line hover:bg-surface-2',
                )}
              >
                <span className="block text-sm font-medium text-ink">{SYSTEM_META[key].label}</span>
                <span className="mt-0.5 block text-xs text-ink-muted">{SYSTEM_META[key].hint}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Bands are based on" htmlFor="scale-basis">
            <Select id="scale-basis" value={basis} onChange={(e) => changeBasis(e.target.value as GradingBasis)}>
              <option value="PERCENT">Percentage (0 – 100%)</option>
              <option value="MARKS">Marks out of a total</option>
            </Select>
          </Field>
          {basis === 'MARKS' ? (
            <Field label="Total marks" htmlFor="scale-outof" required error={errors.outOf} hint="Papers with a different total are scaled">
              <Input id="scale-outof" type="number" min={1} step="1" value={outOf} onChange={(e) => setOutOf(e.target.value)} placeholder="50" className="tnum" />
            </Field>
          ) : null}
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="caption">{system === 'MARKS_ONLY' ? 'Result bands' : 'Bands'} ({unit})</p>
            <div className="flex gap-1">
              <Button type="button" size="sm" variant="ghost" onClick={sortBands}>
                <ArrowDownWideNarrow aria-hidden /> Sort
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={addBand} disabled={bands.length >= 30}>
                <Plus aria-hidden /> Add band
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[440px]">
              <thead>
                <tr className="text-left text-xs font-medium text-ink-subtle">
                  <th className="pb-1 pr-1">{system === 'DESCRIPTIVE' ? 'Descriptor' : system === 'MARKS_ONLY' ? 'Result' : 'Grade'}</th>
                  <th className="pb-1 pr-1 w-20">From</th>
                  <th className="pb-1 pr-1 w-20">To</th>
                  {showPoints ? <th className="pb-1 pr-1 w-16">Points</th> : null}
                  {showRemark ? <th className="pb-1 pr-1">Remark</th> : null}
                  <th className="pb-1 text-center w-12">Pass</th>
                  <th className="w-8"><span className="sr-only">Remove</span></th>
                </tr>
              </thead>
              <tbody>
                {bands.map((band, index) => (
                  <React.Fragment key={band.key}>
                    <tr>
                      <td className="py-1 pr-1">
                        <Input value={band.grade} onChange={(e) => update(band.key, { grade: e.target.value })} aria-label={`Band ${index + 1} label`} maxLength={30} />
                      </td>
                      <td className="py-1 pr-1">
                        <Input type="number" step="0.01" min={0} max={ceiling || undefined} value={band.min} onChange={(e) => update(band.key, { min: e.target.value })} aria-label={`Band ${index + 1} from`} className="tnum" />
                      </td>
                      <td className="py-1 pr-1">
                        <Input type="number" step="0.01" min={0} max={ceiling || undefined} value={band.max} onChange={(e) => update(band.key, { max: e.target.value })} aria-label={`Band ${index + 1} to`} className="tnum" />
                      </td>
                      {showPoints ? (
                        <td className="py-1 pr-1">
                          <Input type="number" step="0.1" min={0} value={band.points} onChange={(e) => update(band.key, { points: e.target.value })} aria-label={`Band ${index + 1} points`} className="tnum" />
                        </td>
                      ) : null}
                      {showRemark ? (
                        <td className="py-1 pr-1">
                          <Input value={band.remark} onChange={(e) => update(band.key, { remark: e.target.value })} aria-label={`Band ${index + 1} remark`} maxLength={120} placeholder="Optional" />
                        </td>
                      ) : null}
                      <td className="py-1 text-center">
                        <Checkbox checked={band.isPass} onChange={(e) => update(band.key, { isPass: e.target.checked })} aria-label={`Band ${index + 1} counts as a pass`} />
                      </td>
                      <td className="py-1">
                        <IconButton label={`Remove band ${index + 1}`} onClick={() => setBands((rows) => rows.filter((b) => b.key !== band.key))} disabled={bands.length <= 1}>
                          <Trash2 className="size-3.5" aria-hidden />
                        </IconButton>
                      </td>
                    </tr>
                    {bandError(index) ? (
                      <tr>
                        <td colSpan={7} className="pb-1 text-xs text-[var(--danger)]">{bandError(index)}</td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          {warnings.length ? (
            <ul className="mt-2 space-y-0.5 text-xs text-[var(--warning)]">
              {warnings.map((w) => <li key={w}>• {w}</li>)}
            </ul>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
          <Field label="A student passes with" htmlFor="scale-pass-rule">
            <Select id="scale-pass-rule" value={passRule} onChange={(e) => setPassRule(e.target.value as PassRule)}>
              {(Object.keys(PASS_RULE_LABELS) as PassRule[]).map((key) => (
                <option key={key} value={key}>{PASS_RULE_LABELS[key]}</option>
              ))}
            </Select>
          </Field>
          {passRule === 'OVERALL' ? (
            <Field label="Pass at (%)" htmlFor="scale-pass-percent" error={errors.passPercent}>
              <Input id="scale-pass-percent" type="number" min={0} max={100} step="0.01" value={passPercent} onChange={(e) => setPassPercent(e.target.value)} className="tnum" />
            </Field>
          ) : null}
        </div>

        <Field label="Description" htmlFor="scale-description" hint="Shown to staff choosing a scale for an exam">
          <Textarea id="scale-description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} />
        </Field>

        <label className="flex items-center gap-2 text-sm text-ink">
          <Checkbox checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
          Use as the default scale for new exams
        </label>

        <Button type="button" onClick={submit} loading={pending} disabled={!name.trim() || bands.length === 0}>
          <Save aria-hidden />
          {mode === 'edit' ? 'Save changes' : 'Create scale'}
        </Button>
      </CardContent>
    </Card>
  )
}
