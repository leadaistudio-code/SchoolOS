'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Camera, CameraOff, CheckSquare, IdCard as IdCardIcon, Palette, Printer, Save, Square, Users } from 'lucide-react'
import { IdCard, type IdCardPerson, type IdCardSchool } from './id-card'
import {
  ID_CARD_CATEGORIES,
  ID_CARD_DESIGNS,
  ID_CARD_FIELDS,
  idCardDesign,
  idCardRows,
  type IdCardCategory,
  type IdCardSettings,
} from '@/lib/id-cards/designs'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox, Field, Input, SearchInput, Select, Textarea } from '@/components/ui/input'
import { ACCENT, StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

export type IdCardSourceView = Omit<IdCardPerson, 'rows'> & { values: Record<string, string> }

const SAMPLE: Record<'student' | 'staff', IdCardSourceView> = {
  student: {
    id: 'sample',
    name: 'Aarav Sharma',
    photoUrl: null,
    idLabel: 'Adm. no.',
    idValue: 'ADM-2026-0042',
    badge: 'Student',
    values: { class: 'Class 5 - A', roll: '12', dob: '14 Mar 2016', blood: 'B+', guardian: 'Rakesh Sharma', phone: '98765 43210', address: 'Sector 12, Noida' },
    qr: null,
    emergency: '98765 43210',
    bloodGroup: 'B+',
  },
  staff: {
    id: 'sample',
    name: 'Priya Verma',
    photoUrl: null,
    idLabel: 'Emp. code',
    idValue: 'EMP-018',
    badge: 'Teacher',
    values: { designation: 'PGT Mathematics', department: 'Science', phone: '98100 12345', email: 'priya@school.in', dob: '02 Aug 1990', joined: '01 Apr 2019', address: 'Indirapuram' },
    qr: null,
    emergency: '98100 12345',
    bloodGroup: null,
  },
}

export function IdCardStudio({
  kind,
  people,
  school,
  initialSettings,
  canSave,
  saveAction,
}: {
  kind: 'student' | 'staff'
  people: IdCardSourceView[]
  school: IdCardSchool
  initialSettings: IdCardSettings
  canSave: boolean
  saveAction: (settings: IdCardSettings) => Promise<{ ok: boolean; message: string }>
}) {
  const router = useRouter()
  const { push } = useToast()
  const [settings, setSettings] = React.useState(initialSettings)
  const [savedJson, setSavedJson] = React.useState(JSON.stringify(initialSettings))
  const [category, setCategory] = React.useState<IdCardCategory | 'All'>('All')
  const [studioOpen, setStudioOpen] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [photo, setPhoto] = React.useState<'all' | 'with' | 'without'>('all')
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set())

  const design = idCardDesign(settings.design)
  const rules = settings.rules.split('\n').map((r) => r.trim()).filter(Boolean)
  const dirty = JSON.stringify(settings) !== savedJson
  const patch = (p: Partial<IdCardSettings>) => setSettings((s) => ({ ...s, ...p }))

  const visible = people.filter((p) => {
    if (photo === 'with' && !p.photoUrl) return false
    if (photo === 'without' && p.photoUrl) return false
    const q = query.trim().toLowerCase()
    return !q || p.name.toLowerCase().includes(q) || p.idValue.toLowerCase().includes(q)
  })
  const withPhoto = people.filter((p) => p.photoUrl).length
  const printing = selected.size ? visible.filter((p) => selected.has(p.id)) : visible

  const toPerson = (p: IdCardSourceView): IdCardPerson => ({ ...p, rows: idCardRows(kind, settings.fields, p.values) })
  const sample = toPerson(people[0] ?? SAMPLE[kind])

  const save = async () => {
    setSaving(true)
    const res = await saveAction(settings)
    setSaving(false)
    push({ tone: res.ok ? 'success' : 'error', title: res.message })
    if (res.ok) {
      setSavedJson(JSON.stringify(settings))
      router.refresh()
    }
  }

  const toggle = (id: string) =>
    setSelected((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const cardProps = {
    design,
    orientation: settings.orientation,
    school,
    showQr: settings.showQr,
    rules,
    signatureLabel: settings.signatureLabel || 'Principal',
  }

  return (
    <div className="space-y-4">
      <div className="no-print grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={kind === 'student' ? 'Total students' : 'Total staff'} value={people.length} icon={Users} accent={ACCENT.indigo} />
        <StatCard label="With photo" value={withPhoto} icon={Camera} accent={ACCENT.emerald} />
        <StatCard label="Without photo" value={people.length - withPhoto} icon={CameraOff} accent={ACCENT.rose} hint={people.length - withPhoto ? 'Upload photos before printing' : undefined} />
        <StatCard label="Selected to print" value={selected.size || 'All'} icon={CheckSquare} accent={ACCENT.amber} />
      </div>

      <Card className="no-print">
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-[10px] bg-[var(--product-50)] text-[var(--product-600)]">
                <Palette className="size-[18px]" aria-hidden />
              </span>
              <div>
                <p className="text-sm font-semibold text-ink">
                  {design.name} <span className="font-normal text-ink-subtle">· {design.category} · {settings.orientation}</span>
                </p>
                <p className="text-xs text-ink-subtle">
                  {settings.showBack ? 'Front & back' : 'Front only'} · QR {settings.showQr ? 'on' : 'off'}
                  {dirty ? ' · unsaved changes' : ''}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => setStudioOpen((o) => !o)}>
                <Palette aria-hidden /> {studioOpen ? 'Close design studio' : 'Design studio'}
              </Button>
              {canSave ? (
                <Button size="sm" onClick={save} disabled={!dirty || saving}>
                  <Save aria-hidden /> {saving ? 'Saving…' : 'Save design'}
                </Button>
              ) : null}
            </div>
          </div>

          {studioOpen ? (
            <div className="grid gap-5 border-t border-line pt-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
              <div className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {(['All', ...ID_CARD_CATEGORIES] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCategory(c)}
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                        category === c
                          ? 'border-[var(--product-500)] bg-[var(--product-50)] text-[var(--product-700)]'
                          : 'border-line text-ink-muted hover:bg-surface-2',
                      )}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                  {ID_CARD_DESIGNS.filter((d) => category === 'All' || d.category === category).map((d, i) => (
                    <button
                      key={d.key}
                      type="button"
                      onClick={() => patch({ design: d.key })}
                      className={cn(
                        'group flex flex-col items-center gap-1.5 rounded-[var(--radius-sm)] border p-2 text-left transition-colors',
                        settings.design === d.key
                          ? 'border-[var(--product-500)] bg-[var(--product-50)] ring-2 ring-[var(--product-200)]'
                          : 'border-line hover:border-line-strong hover:bg-surface-2',
                      )}
                    >
                      <Thumb orientation={settings.orientation} scale={settings.orientation === 'horizontal' ? 0.48 : 0.42}>
                        <IdCard {...cardProps} design={d} side="front" person={sample} />
                      </Thumb>
                      <span className="w-full truncate text-xs font-semibold text-ink">
                        {i + 1}. {d.name}
                      </span>
                      <span className="w-full text-[11px] text-ink-subtle">{d.category}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <Field label="Layout" htmlFor="idc-orientation">
                  <div className="grid grid-cols-2 gap-1 rounded-[var(--radius-sm)] bg-surface-2 p-1">
                    {(['horizontal', 'vertical'] as const).map((o) => (
                      <button
                        key={o}
                        type="button"
                        id={o === 'horizontal' ? 'idc-orientation' : undefined}
                        onClick={() => patch({ orientation: o })}
                        className={cn(
                          'rounded-[6px] py-1.5 text-xs font-semibold capitalize',
                          settings.orientation === o ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted',
                        )}
                      >
                        {o}
                      </button>
                    ))}
                  </div>
                </Field>
                <label className="flex items-center gap-2 text-sm text-ink">
                  <Checkbox checked={settings.showBack} onChange={(e) => patch({ showBack: e.target.checked })} />
                  Print back side
                </label>
                <label className="flex items-center gap-2 text-sm text-ink">
                  <Checkbox checked={settings.showQr} onChange={(e) => patch({ showQr: e.target.checked })} />
                  QR code on front
                </label>
                <fieldset className="space-y-1.5">
                  <legend className="mb-1 text-sm font-medium text-ink">Details printed</legend>
                  {ID_CARD_FIELDS[kind].map((f) => (
                    <label key={f.key} className="flex items-center gap-2 text-sm text-ink">
                      <Checkbox
                        checked={settings.fields.includes(f.key)}
                        onChange={(e) =>
                          patch({
                            fields: e.target.checked
                              ? [...settings.fields, f.key]
                              : settings.fields.filter((k) => k !== f.key),
                          })
                        }
                      />
                      {f.label}
                    </label>
                  ))}
                </fieldset>
                <Field label="Signature label" htmlFor="idc-sign">
                  <Input id="idc-sign" value={settings.signatureLabel} onChange={(e) => patch({ signatureLabel: e.target.value })} />
                </Field>
                <Field label="Rules on the back (one per line)" htmlFor="idc-rules">
                  <Textarea id="idc-rules" rows={4} value={settings.rules} onChange={(e) => patch({ rules: e.target.value })} />
                </Field>
                <div className="flex justify-center gap-2 rounded-[var(--radius-sm)] bg-surface-2 p-3">
                  <Thumb scale={0.62} orientation={settings.orientation}>
                    <IdCard {...cardProps} side="front" person={sample} />
                  </Thumb>
                  {settings.showBack ? (
                    <Thumb scale={0.62} orientation={settings.orientation}>
                      <IdCard {...cardProps} side="back" person={sample} />
                    </Thumb>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="no-print">
        <CardContent className="flex flex-wrap items-center gap-2 p-3">
          <SearchInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search name or ${kind === 'student' ? 'admission' : 'employee'} no.`} aria-label="Search cards" />
          <Select value={photo} onChange={(e) => setPhoto(e.target.value as typeof photo)} className="w-40" aria-label="Photo filter">
            <option value="all">All cards</option>
            <option value="with">With photo</option>
            <option value="without">Without photo</option>
          </Select>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set(visible.map((p) => p.id)))}>
            <CheckSquare aria-hidden /> Select all
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())} disabled={!selected.size}>
            <Square aria-hidden /> Clear
          </Button>
          <Button size="sm" onClick={() => window.print()} disabled={!printing.length} className="ml-auto">
            <Printer aria-hidden /> Print {selected.size ? `${printing.length} selected` : `all ${printing.length}`}
          </Button>
        </CardContent>
      </Card>

      {people.length === 0 ? (
        <Card className="no-print">
          <EmptyState title="No cards to show" description={kind === 'student' ? 'Choose a class with active students.' : 'Add staff to the directory first.'} />
        </Card>
      ) : (
        <div className="id-card-sheet flex flex-wrap justify-center gap-5">
          {visible.map((p) => {
            const person = toPerson(p)
            const isSelected = selected.has(p.id)
            const hiddenInPrint = selected.size > 0 && !isSelected
            return (
              <div key={p.id} className={cn('id-card-pair relative flex gap-[3mm]', hiddenInPrint && 'print-hidden')}>
                <label className="no-print absolute -left-2 -top-2 z-10 grid size-6 cursor-pointer place-items-center rounded-full border border-line bg-surface shadow-sm">
                  <Checkbox checked={isSelected} onChange={() => toggle(p.id)} aria-label={`Select ${p.name}`} />
                </label>
                <IdCard {...cardProps} side="front" person={person} />
                {settings.showBack ? <IdCard {...cardProps} side="back" person={person} /> : null}
              </div>
            )
          })}
        </div>
      )}

      {visible.length === 0 && people.length > 0 ? (
        <p className="no-print flex items-center justify-center gap-2 text-sm text-ink-muted">
          <IdCardIcon className="size-4" aria-hidden /> No cards match the search.
        </p>
      ) : null}

      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 8mm; }
          .id-card-sheet { gap: 4mm !important; justify-content: flex-start !important; }
          .id-card-pair { break-inside: avoid; }
          .id-card { box-shadow: none !important; outline: 0.2mm dashed #cbd5e1; }
          .print-hidden { display: none !important; }
        }
      `}</style>
    </div>
  )
}

function Thumb({
  children,
  scale = 0.48,
  orientation = 'horizontal',
}: {
  children: React.ReactNode
  scale?: number
  orientation?: 'horizontal' | 'vertical'
}) {
  const w = orientation === 'horizontal' ? 85.6 : 54
  const h = orientation === 'horizontal' ? 54 : 85.6
  return (
    <div style={{ width: `${w * scale}mm`, height: `${h * scale}mm` }} className="relative shrink-0">
      <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }} className="absolute left-0 top-0">
        {children}
      </div>
    </div>
  )
}
