'use client'

import { useActionState, useState } from 'react'
import { Save } from 'lucide-react'
import {
  createReportCardTemplateAction,
  updateReportCardTemplateAction,
} from '../certificates/actions'
import { emptyFormState } from '@/lib/form-state'
import { DEFAULT_REPORT_CARD_CONFIG, type ReportCardConfig, type SignatureImages } from '@/lib/exams/report-card-config'
import { SignatureUpload } from './signature-upload'
import { Button } from '@/components/ui/button'
import { Checkbox, Field, Input, Select } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'

type TemplateValues = {
  id?: string
  name: string
  isDefault: boolean
  showAttendance: boolean
  showRank: boolean
  showRemarks: boolean
  headerHtml: string
  footerHtml: string
  config: ReportCardConfig
}

const ACCENTS = ['#0f5132', '#1e3a8a', '#7c2d12', '#581c87', '#0f766e', '#9f1239', '#334155']
const textarea = 'w-full rounded-[var(--radius-sm)] border border-line bg-surface px-3 py-2.5 text-sm'

export function ReportCardTemplateForm({ initial }: { initial?: TemplateValues }) {
  const action = initial?.id ? updateReportCardTemplateAction : createReportCardTemplateAction
  const [state, formAction, pending] = useActionState(action, emptyFormState)
  const config = initial?.config ?? DEFAULT_REPORT_CARD_CONFIG
  const [layout, setLayout] = useState(config.layout)
  const [accent, setAccent] = useState(config.accent)
  const [signatures, setSignatures] = useState<SignatureImages>(config.signatureImages)

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {initial?.id ? <input type="hidden" name="id" value={initial.id} /> : null}
      <input type="hidden" name="design" value={config.design} />
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.ok && state.message ? <Notice tone="success">{state.message}</Notice> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Template name" htmlFor="name" required error={state.fieldErrors.name}>
          <Input id="name" name="name" required maxLength={80} placeholder="Holistic progress card" defaultValue={initial?.name} />
        </Field>
        <Field label="Layout" htmlFor="layout">
          <Select id="layout" name="layout" value={layout} onChange={(e) => setLayout(e.target.value === 'CLASSIC' ? 'CLASSIC' : 'HOLISTIC')}>
            <option value="HOLISTIC">Holistic progress card (NEP 2020 / CBSE)</option>
            <option value="CLASSIC">Classic report card (marks only)</option>
          </Select>
        </Field>
      </div>

      <fieldset className="space-y-3 rounded-xl border border-line p-4">
        <legend className="px-1 text-sm font-semibold text-ink">Header</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Card title" htmlFor="title">
            <Input id="title" name="title" maxLength={160} defaultValue={config.title} />
          </Field>
          <Field label="Subtitle" htmlFor="subtitle">
            <Input id="subtitle" name="subtitle" maxLength={160} defaultValue={config.subtitle} />
          </Field>
          <Field label="Affiliation line" htmlFor="affiliation" hint="e.g. Affiliated to CBSE, New Delhi">
            <Input id="affiliation" name="affiliation" maxLength={160} defaultValue={config.affiliation} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Board badge" htmlFor="boardBadge" hint="Leave blank to hide">
              <Input id="boardBadge" name="boardBadge" maxLength={24} defaultValue={config.boardBadge} />
            </Field>
            <Field label="Affiliation no." htmlFor="affiliationNo">
              <Input id="affiliationNo" name="affiliationNo" maxLength={60} defaultValue={config.affiliationNo} />
            </Field>
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-sm font-medium text-ink">Theme colour</p>
          <input type="hidden" name="accent" value={accent} />
          <div className="flex flex-wrap items-center gap-2">
            {ACCENTS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Theme ${c}`}
                onClick={() => setAccent(c)}
                className="size-8 rounded-full ring-offset-2 transition"
                style={{ background: c, boxShadow: accent === c ? `0 0 0 2px white, 0 0 0 4px ${c}` : undefined }}
              />
            ))}
            <input type="color" aria-label="Custom theme colour" value={accent} onChange={(e) => setAccent(e.target.value)} className="h-8 w-10 cursor-pointer rounded border border-line" />
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-3 rounded-xl border border-line p-4">
        <legend className="px-1 text-sm font-semibold text-ink">Sections</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink">
          <label className="flex items-center gap-2"><Checkbox name="showAttendance" defaultChecked={initial?.showAttendance ?? true} />Attendance record</label>
          <label className="flex items-center gap-2"><Checkbox name="showRemarks" defaultChecked={initial?.showRemarks ?? true} />Qualitative remarks column</label>
          <label className="flex items-center gap-2"><Checkbox name="showRank" defaultChecked={initial?.showRank ?? true} />Class standing (rank)</label>
          <label className="flex items-center gap-2"><Checkbox name="showSeal" defaultChecked={config.showSeal} />Official seal</label>
          <label className="flex items-center gap-2"><Checkbox name="showPhoto" defaultChecked={config.showPhoto} />Student photo</label>
          {layout === 'HOLISTIC' ? (
            <label className="flex items-center gap-2"><Checkbox name="showPart2" defaultChecked={config.showPart2} />Part 2 · holistic development</label>
          ) : null}
        </div>
        {layout === 'HOLISTIC' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="21st-century competencies" htmlFor="competencies" hint="One per line · scored 0–5">
              <textarea id="competencies" name="competencies" rows={6} className={textarea} defaultValue={config.competencies.join('\n')} />
            </Field>
            <Field label="Co-scholastic domains" htmlFor="coScholastic" hint="One per line · graded A+ to C">
              <textarea id="coScholastic" name="coScholastic" rows={6} className={textarea} defaultValue={config.coScholastic.join('\n')} />
            </Field>
          </div>
        ) : (
          <>
            <input type="hidden" name="competencies" value={config.competencies.join('\n')} />
            <input type="hidden" name="coScholastic" value={config.coScholastic.join('\n')} />
            {config.showPart2 ? <input type="hidden" name="showPart2" value="on" /> : null}
          </>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          {config.signatories.map((label, i) => (
            <div key={i} className="space-y-2">
              <Field label={`Signature ${i + 1}`} htmlFor={`signatory${i}`}>
                <Input id={`signatory${i}`} name={`signatory${i}`} maxLength={40} defaultValue={label} />
              </Field>
              <input type="hidden" name={`signatureImage${i}`} value={signatures[i] ?? ''} />
              <SignatureUpload
                label={label}
                value={signatures[i] ?? null}
                onChange={(url) => setSignatures((cur) => cur.map((v, j) => (j === i ? url : v)) as SignatureImages)}
              />
            </div>
          ))}
        </div>
        <p className="text-xs text-ink-subtle">
          Upload a signature on a white or transparent background (PNG works best). If Signature 3 has none, the
          principal signature from Settings → Branding is used.
        </p>
      </fieldset>

      <input type="hidden" name="headerHtml" value={initial?.headerHtml ?? ''} />
      <input type="hidden" name="footerHtml" value={initial?.footerHtml ?? ''} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-ink">
          <Checkbox name="isDefault" defaultChecked={initial?.isDefault ?? !initial} />
          Use as default template
        </label>
        <Button type="submit" loading={pending}>
          {!pending ? <Save className="size-4" aria-hidden /> : null}
          {initial?.id ? 'Update template' : 'Save template'}
        </Button>
      </div>
    </form>
  )
}
