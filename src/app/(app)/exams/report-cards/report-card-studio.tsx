'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Check, LayoutTemplate, Palette, Printer, RotateCcw, Save } from 'lucide-react'
import { saveReportCardDesignAction } from '../actions'
import type { ReportCardConfig, SignatureImages } from '@/lib/exams/report-card-config'
import { REPORT_CARD_DESIGNS } from '@/lib/exams/report-card-designs'
import type { ReportCardDocumentData } from '@/lib/exams/report-card-data'
import { HolisticReportCard } from '@/components/print/holistic-report-card'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox, Field, Input, Select } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { SignatureUpload } from './signature-upload'

const THEMES = [
  { name: 'Forest green', hex: '#0f5132' },
  { name: 'Royal blue', hex: '#1e3a8a' },
  { name: 'Navy', hex: '#172554' },
  { name: 'Maroon', hex: '#7f1d1d' },
  { name: 'Crimson', hex: '#9f1239' },
  { name: 'Purple', hex: '#581c87' },
  { name: 'Teal', hex: '#0f766e' },
  { name: 'Burnt orange', hex: '#9a3412' },
  { name: 'Brown', hex: '#713f12' },
  { name: 'Charcoal', hex: '#334155' },
]

export type StudioTemplate = {
  id: string
  name: string
  isDefault: boolean
  showAttendance: boolean
  showRank: boolean
  showRemarks: boolean
  config: ReportCardConfig
}

type Settings = Omit<StudioTemplate, 'id' | 'name' | 'isDefault'>

const settingsOf = (t: StudioTemplate): Settings => ({
  showAttendance: t.showAttendance,
  showRank: t.showRank,
  showRemarks: t.showRemarks,
  config: t.config,
})

/** Gallery of report card designs with a live, editable A4 preview — the report card twin of the ID card studio. */
export function ReportCardStudio({ templates, sample }: { templates: StudioTemplate[]; sample: ReportCardDocumentData }) {
  const router = useRouter()
  const { push } = useToast()
  const [templateId, setTemplateId] = React.useState(templates[0]?.id ?? '')
  const template = templates.find((t) => t.id === templateId) ?? templates[0]
  const [settings, setSettings] = React.useState<Settings | null>(template ? settingsOf(template) : null)
  const [savedJson, setSavedJson] = React.useState(template ? JSON.stringify(settingsOf(template)) : '')
  const [saving, setSaving] = React.useState(false)

  if (!template || !settings) return null

  const config = settings.config
  const dirty = JSON.stringify(settings) !== savedJson
  const patch = (p: Partial<ReportCardConfig>) => setSettings((s) => (s ? { ...s, config: { ...s.config, ...p } } : s))
  const flag = (p: Partial<Omit<Settings, 'config'>>) => setSettings((s) => (s ? { ...s, ...p } : s))
  const design = REPORT_CARD_DESIGNS.find((d) => d.key === config.design) ?? REPORT_CARD_DESIGNS[0]!

  const preview = (c: ReportCardConfig): ReportCardDocumentData => ({
    ...sample,
    config: c,
    options: { showAttendance: settings.showAttendance, showRank: settings.showRank, showRemarks: settings.showRemarks },
  })

  const switchTemplate = (id: string) => {
    if (dirty && !window.confirm('Discard unsaved design changes?')) return
    const next = templates.find((t) => t.id === id)
    if (!next) return
    setTemplateId(id)
    setSettings(settingsOf(next))
    setSavedJson(JSON.stringify(settingsOf(next)))
  }

  const reset = () => setSettings(JSON.parse(savedJson) as Settings)

  const save = async () => {
    setSaving(true)
    const res = await saveReportCardDesignAction(template.id, settings)
    setSaving(false)
    push({ tone: res.ok ? 'success' : 'error', title: res.message })
    if (res.ok) {
      setSavedJson(JSON.stringify(settings))
      router.refresh()
    }
  }

  const setSignatory = (i: number, label: string) =>
    patch({ signatories: config.signatories.map((v, j) => (j === i ? label : v)) as ReportCardConfig['signatories'] })
  const setSignature = (i: number, url: string | null) =>
    patch({ signatureImages: config.signatureImages.map((v, j) => (j === i ? url : v)) as SignatureImages })

  return (
    <div className="space-y-4">
      <Card className="no-print">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-[10px] bg-[var(--product-50)] text-[var(--product-600)]">
              <Palette className="size-[18px]" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink">
                Report card design studio <span className="font-normal text-ink-subtle">· {design.name}</span>
              </p>
              <p className="text-xs text-ink-subtle">
                Fictional student preview. Saving updates every report card that uses “{template.name}”.
                {dirty ? ' · unsaved changes' : ''}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {templates.length > 1 ? (
              <Select value={template.id} onChange={(e) => switchTemplate(e.target.value)} className="w-52" aria-label="Template to design">
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.isDefault ? ' (default)' : ''}
                  </option>
                ))}
              </Select>
            ) : null}
            {dirty ? (
              <Button variant="ghost" size="sm" onClick={reset} disabled={saving}>
                <RotateCcw aria-hidden /> Reset
              </Button>
            ) : null}
            <Button size="sm" onClick={save} disabled={!dirty} loading={saving}>
              {!saving ? <Save aria-hidden /> : null} {dirty ? 'Save design' : 'Design saved'}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => window.print()}>
              <Printer aria-hidden /> Print sample
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="min-w-0 space-y-4">
          <Card className="no-print">
            <CardContent className="space-y-3 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                <LayoutTemplate className="size-4 text-ink-muted" aria-hidden /> Designs
              </p>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {REPORT_CARD_DESIGNS.map((d, i) => (
                  <button
                    key={d.key}
                    type="button"
                    onClick={() => patch({ design: d.key })}
                    aria-pressed={config.design === d.key}
                    className={cn(
                      'flex flex-col items-center gap-1.5 rounded-[var(--radius-sm)] border p-2 text-left transition-colors',
                      config.design === d.key
                        ? 'border-[var(--product-500)] bg-[var(--product-50)] ring-2 ring-[var(--product-200)]'
                        : 'border-line hover:border-line-strong hover:bg-surface-2',
                    )}
                  >
                    <Thumb scale={0.25}>
                      <HolisticReportCard data={preview({ ...config, design: d.key })} />
                    </Thumb>
                    <span className="w-full truncate text-xs font-semibold text-ink">
                      {i + 1}. {d.name}
                    </span>
                    <span className="line-clamp-2 w-full text-[11px] text-ink-subtle">{d.description}</span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="rounded-xl bg-surface-2 p-3 print:bg-transparent print:p-0">
            <HolisticReportCard data={preview(config)} />
          </div>
        </div>

        <Card className="no-print h-fit xl:sticky xl:top-4">
          <CardContent className="space-y-4 p-4">
            <div>
              <p className="mb-1.5 text-sm font-medium text-ink">Colour theme</p>
              <div className="flex flex-wrap items-center gap-2">
                {THEMES.map((t) => {
                  const active = config.accent.toLowerCase() === t.hex
                  return (
                    <button
                      key={t.hex}
                      type="button"
                      title={t.name}
                      aria-label={t.name}
                      aria-pressed={active}
                      onClick={() => patch({ accent: t.hex })}
                      className="grid size-7 place-items-center rounded-full transition hover:scale-110"
                      style={{ background: t.hex, boxShadow: active ? `0 0 0 2px var(--surface), 0 0 0 4px ${t.hex}` : undefined }}
                    >
                      {active ? <Check className="size-3.5 text-white" strokeWidth={3} aria-hidden /> : null}
                    </button>
                  )
                })}
                <input
                  type="color"
                  value={config.accent}
                  onChange={(e) => patch({ accent: e.target.value.toLowerCase() })}
                  className="h-7 w-9 cursor-pointer rounded border border-line bg-transparent p-0"
                  aria-label="Custom theme colour"
                />
              </div>
            </div>

            <Field label="Layout" htmlFor="rcs-layout">
              <div className="grid grid-cols-2 gap-1 rounded-[var(--radius-sm)] bg-surface-2 p-1">
                {(['HOLISTIC', 'CLASSIC'] as const).map((l) => (
                  <button
                    key={l}
                    type="button"
                    id={l === 'HOLISTIC' ? 'rcs-layout' : undefined}
                    onClick={() => patch({ layout: l })}
                    className={cn(
                      'rounded-[6px] py-1.5 text-xs font-semibold',
                      config.layout === l ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted',
                    )}
                  >
                    {l === 'HOLISTIC' ? 'Holistic (NEP)' : 'Classic (marks)'}
                  </button>
                ))}
              </div>
            </Field>

            <fieldset className="space-y-1.5">
              <legend className="mb-1 text-sm font-medium text-ink">Show on the card</legend>
              {[
                { label: 'Student photo', checked: config.showPhoto, set: (v: boolean) => patch({ showPhoto: v }) },
                { label: 'Attendance record', checked: settings.showAttendance, set: (v: boolean) => flag({ showAttendance: v }) },
                { label: 'Qualitative remarks column', checked: settings.showRemarks, set: (v: boolean) => flag({ showRemarks: v }) },
                { label: 'Class standing (rank)', checked: settings.showRank, set: (v: boolean) => flag({ showRank: v }) },
                { label: 'Official seal', checked: config.showSeal, set: (v: boolean) => patch({ showSeal: v }) },
                ...(config.layout === 'HOLISTIC'
                  ? [{ label: 'Part 2 · holistic development', checked: config.showPart2, set: (v: boolean) => patch({ showPart2: v }) }]
                  : []),
              ].map((o) => (
                <label key={o.label} className="flex items-center gap-2 text-sm text-ink">
                  <Checkbox checked={o.checked} onChange={(e) => o.set(e.target.checked)} />
                  {o.label}
                </label>
              ))}
            </fieldset>

            <div className="space-y-3">
              <Field label="Card title" htmlFor="rcs-title">
                <Input id="rcs-title" maxLength={160} value={config.title} onChange={(e) => patch({ title: e.target.value })} />
              </Field>
              <Field label="Affiliation line" htmlFor="rcs-aff">
                <Input id="rcs-aff" maxLength={160} value={config.affiliation} placeholder="Affiliated to CBSE, New Delhi" onChange={(e) => patch({ affiliation: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Board badge" htmlFor="rcs-badge">
                  <Input id="rcs-badge" maxLength={24} value={config.boardBadge} onChange={(e) => patch({ boardBadge: e.target.value })} />
                </Field>
                <Field label="Affiliation no." htmlFor="rcs-affno">
                  <Input id="rcs-affno" maxLength={60} value={config.affiliationNo} onChange={(e) => patch({ affiliationNo: e.target.value })} />
                </Field>
              </div>
            </div>

            <fieldset className="space-y-3">
              <legend className="mb-1 text-sm font-medium text-ink">Signatories</legend>
              {config.signatories.map((label, i) => (
                <div key={i} className="space-y-1.5 rounded-[var(--radius-sm)] border border-line p-2.5">
                  <Input
                    aria-label={`Signature ${i + 1} title`}
                    maxLength={40}
                    value={label}
                    onChange={(e) => setSignatory(i, e.target.value)}
                  />
                  <SignatureUpload label={label} value={config.signatureImages[i] ?? null} onChange={(url) => setSignature(i, url)} />
                </div>
              ))}
              <p className="text-[11px] text-ink-subtle">
                PNG on a white or transparent background works best. With no image, signature 3 falls back to the
                principal signature in Settings → Branding.
              </p>
            </fieldset>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

/** Shows the top of an A4 card, scaled down, as a gallery tile. */
function Thumb({ children, scale }: { children: React.ReactNode; scale: number }) {
  return (
    <div
      style={{ width: `${210 * scale}mm`, height: `${150 * scale}mm` }}
      className="pointer-events-none relative shrink-0 overflow-hidden rounded-sm bg-white shadow-sm"
      aria-hidden
    >
      <div style={{ width: '210mm', transform: `scale(${scale})`, transformOrigin: 'top left' }} className="absolute left-0 top-0">
        {children}
      </div>
    </div>
  )
}
