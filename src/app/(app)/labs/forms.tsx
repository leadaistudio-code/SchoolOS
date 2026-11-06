'use client'

import { useActionState, useState } from 'react'
import { emptyFormState, type FormState } from '@/lib/form-state'
import { Button } from '@/components/ui/button'
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'
import {
  HAZARDS,
  INCIDENT_SEVERITIES,
  INCIDENT_TYPES,
  ITEM_CATEGORIES,
  LAB_TYPES,
  PRACTICAL_SUBJECTS,
  WASTE_CATEGORIES,
  labelOf,
  type ChecklistItem,
  type InfraCheck,
} from '@/lib/labs/types'
import {
  addItemAction,
  bookSessionAction,
  closeIncidentAction,
  countAction,
  createLabAction,
  incidentAction,
  inspectionAction,
  movementAction,
  saveExperimentAction,
  saveInfrastructureAction,
  updateItemAction,
  updateLabAction,
  wasteAction,
} from './actions'

type Option = { id: string; label: string }

function Status({ state }: { state: FormState }) {
  if (state.error) return <Notice tone="danger">{state.error}</Notice>
  if (state.ok && state.message) return <Notice tone="success">{state.message}</Notice>
  return null
}

function StaffSelect({ name, staff, defaultValue, label }: { name: string; staff: Option[]; defaultValue?: string | null; label: string }) {
  return (
    <Field label={label} htmlFor={name}>
      <Select id={name} name={name} defaultValue={defaultValue ?? ''}>
        <option value="">Not assigned</option>
        {staff.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </Select>
    </Field>
  )
}

/* ---------------------------------------------------------------- setup */

export function CreateLabForm({ staff }: { staff: Option[] }) {
  const [state, action, pending] = useActionState(createLabAction, emptyFormState)
  const [type, setType] = useState<string>('COMPOSITE_SCIENCE')
  const typeLabel = labelOf(LAB_TYPES, type).replace(/\s*\(.*\)$/, '')
  return (
    <form action={action} className="space-y-3">
      <Status state={state} />
      <Field label="Lab type" htmlFor="type" required>
        <Select id="type" name="type" value={type} onChange={(e) => setType(e.target.value)}>
          {LAB_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Lab name" htmlFor="name" required error={state.fieldErrors.name}>
        <Input key={type} id="name" name="name" defaultValue={typeLabel} required />
      </Field>
      <Field label="Room" htmlFor="room">
        <Input id="room" name="room" placeholder="e.g. Block B, Room 12" />
      </Field>
      <StaffSelect name="inChargeStaffId" staff={staff} label="Teacher in charge" />
      <StaffSelect name="assistantStaffId" staff={staff} label="Lab assistant" />
      <label className="flex items-start gap-2 text-sm text-ink">
        <Checkbox name="loadItems" defaultChecked className="mt-0.5" />
        <span>Load the required item list into the register (you enter what you have in the next step)</span>
      </label>
      <label className="flex items-start gap-2 text-sm text-ink">
        <Checkbox name="loadPracticals" defaultChecked className="mt-0.5" />
        <span>Load the default practicals for this lab type into the practical library</span>
      </label>
      <Button type="submit" loading={pending}>
        Set up lab
      </Button>
    </form>
  )
}

export function LabDetailsForm({
  lab,
  staff,
}: {
  lab: {
    id: string
    name: string
    room: string | null
    inChargeStaffId: string | null
    assistantStaffId: string | null
    notes: string | null
    contacts: { label: string; phone: string }[]
  }
  staff: Option[]
}) {
  const [state, action, pending] = useActionState(updateLabAction.bind(null, lab.id), emptyFormState)
  const defaults = [
    ...lab.contacts,
    ...[
      { label: 'Ambulance', phone: '108' },
      { label: 'Fire', phone: '101' },
      { label: 'Police', phone: '112' },
      { label: 'Principal', phone: '' },
      { label: 'Nearest hospital', phone: '' },
      { label: 'Gas supplier', phone: '' },
    ].filter((d) => !lab.contacts.some((c) => c.label === d.label)),
  ].slice(0, 6)
  return (
    <form action={action} className="space-y-3">
      <Status state={state} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Lab name" htmlFor="name" required>
          <Input id="name" name="name" defaultValue={lab.name} required />
        </Field>
        <Field label="Room" htmlFor="room">
          <Input id="room" name="room" defaultValue={lab.room ?? ''} />
        </Field>
        <StaffSelect name="inChargeStaffId" staff={staff} defaultValue={lab.inChargeStaffId} label="Teacher in charge" />
        <StaffSelect name="assistantStaffId" staff={staff} defaultValue={lab.assistantStaffId} label="Lab assistant" />
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-ink">Emergency numbers (printed on the display board)</legend>
        {defaults.map((c, i) => (
          <div key={i} className="grid grid-cols-2 gap-2">
            <Input name={`contactLabel${i}`} defaultValue={c.label} aria-label={`Contact ${i + 1} name`} />
            <Input name={`contactPhone${i}`} defaultValue={c.phone} placeholder="Phone" aria-label={`Contact ${i + 1} phone`} />
          </div>
        ))}
      </fieldset>
      <Field label="Notes" htmlFor="notes">
        <Textarea id="notes" name="notes" rows={2} defaultValue={lab.notes ?? ''} />
      </Field>
      <Button type="submit" loading={pending}>
        Save details
      </Button>
    </form>
  )
}

export function InfrastructureForm({
  labId,
  checks,
  answers,
  canEdit,
}: {
  labId: string
  checks: InfraCheck[]
  answers: Record<string, { ok: boolean; value?: number; note?: string }>
  canEdit: boolean
}) {
  const [state, action, pending] = useActionState(saveInfrastructureAction.bind(null, labId), emptyFormState)
  const groups = [...new Set(checks.map((c) => c.group))]
  return (
    <form action={action} className="space-y-4">
      <Status state={state} />
      {groups.map((group) => (
        <fieldset key={group} className="space-y-2">
          <legend className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{group}</legend>
          <ul className="divide-y divide-line rounded-[var(--radius-sm)] border border-line">
            {checks
              .filter((c) => c.group === group)
              .map((c) => {
                const a = answers[c.code]
                return (
                  <li key={c.code} className="flex flex-wrap items-center gap-3 px-3 py-2">
                    {c.min !== undefined ? (
                      <Input
                        name={`value_${c.code}`}
                        type="number"
                        min={0}
                        step="any"
                        defaultValue={a?.value ?? ''}
                        className="w-24"
                        aria-label={c.label}
                        disabled={!canEdit}
                      />
                    ) : (
                      <Checkbox name={`ok_${c.code}`} defaultChecked={a?.ok ?? false} aria-label={c.label} disabled={!canEdit} />
                    )}
                    <span className="flex-1 min-w-48 text-sm text-ink">
                      {c.label}
                      {c.min !== undefined ? (
                        <span className="text-ink-subtle"> · at least {c.min} {c.unit}</span>
                      ) : null}
                    </span>
                    <Input
                      name={`note_${c.code}`}
                      defaultValue={a?.note ?? ''}
                      placeholder="Note"
                      className="w-full sm:w-56"
                      aria-label={`${c.label} note`}
                      disabled={!canEdit}
                    />
                  </li>
                )
              })}
          </ul>
        </fieldset>
      ))}
      {canEdit ? (
        <Button type="submit" loading={pending}>
          Save checklist
        </Button>
      ) : null}
    </form>
  )
}

/* ------------------------------------------------------------- register */

export type ItemFormValue = {
  id: string
  name: string
  category: string
  kind: string
  unit: string
  requiredQty: number
  reorderLevel: number
  storageLocation: string | null
  hazards: string[]
  expiresOn: string | null
  unitCostMinor: number
  notes: string | null
}

function ItemFields({ item }: { item?: ItemFormValue }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Item name" htmlFor="name" required>
          <Input id="name" name="name" defaultValue={item?.name} required />
        </Field>
        <Field label="Category" htmlFor="category">
          <Select id="category" name="category" defaultValue={item?.category ?? 'APPARATUS'}>
            {ITEM_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Type" htmlFor="kind">
          <Select id="kind" name="kind" defaultValue={item?.kind ?? 'NON_CONSUMABLE'}>
            <option value="NON_CONSUMABLE">Non-consumable (apparatus, glassware)</option>
            <option value="CONSUMABLE">Consumable (chemicals, paper)</option>
          </Select>
        </Field>
        <Field label="Unit" htmlFor="unit" required hint="pcs, ml, g, boxes…">
          <Input id="unit" name="unit" defaultValue={item?.unit ?? 'pcs'} required />
        </Field>
        <Field label="Required quantity" htmlFor="requiredQty" hint="For one batch, per the lab standard">
          <Input id="requiredQty" name="requiredQty" type="number" min={0} step="any" defaultValue={item?.requiredQty ?? 0} />
        </Field>
        <Field label="Reorder at" htmlFor="reorderLevel" hint="Alert when stock falls to this">
          <Input id="reorderLevel" name="reorderLevel" type="number" min={0} step="any" defaultValue={item?.reorderLevel ?? 0} />
        </Field>
        <Field label="Storage location" htmlFor="storageLocation">
          <Input id="storageLocation" name="storageLocation" defaultValue={item?.storageLocation ?? ''} placeholder="Cupboard A, shelf 2" />
        </Field>
        <Field label="Expiry / refill date" htmlFor="expiresOn">
          <Input id="expiresOn" name="expiresOn" type="date" defaultValue={item?.expiresOn ?? ''} />
        </Field>
        <Field label="Unit cost (₹)" htmlFor="unitCost">
          <Input id="unitCost" name="unitCost" type="number" min={0} step="0.01" defaultValue={item ? item.unitCostMinor / 100 : ''} />
        </Field>
      </div>
      <fieldset>
        <legend className="text-sm font-medium text-ink">Hazards</legend>
        <div className="mt-1 flex flex-wrap gap-3">
          {HAZARDS.map((h) => (
            <label key={h.value} className="flex items-center gap-1.5 text-sm text-ink">
              <Checkbox name="hazards" value={h.value} defaultChecked={item?.hazards.includes(h.value)} />
              {h.label}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Notes" htmlFor="notes">
        <Textarea id="notes" name="notes" rows={2} defaultValue={item?.notes ?? ''} />
      </Field>
    </>
  )
}

export function AddItemForm({ labId }: { labId: string }) {
  const [state, action, pending] = useActionState(addItemAction.bind(null, labId), emptyFormState)
  return (
    <form action={action} className="space-y-3">
      <Status state={state} />
      <ItemFields />
      <Field label="Opening stock" htmlFor="openingQty">
        <Input id="openingQty" name="openingQty" type="number" min={0} step="any" defaultValue={0} />
      </Field>
      <Button type="submit" loading={pending}>
        Add item
      </Button>
    </form>
  )
}

export function EditItemForm({ labId, item }: { labId: string; item: ItemFormValue }) {
  const [state, action, pending] = useActionState(updateItemAction.bind(null, labId, item.id), emptyFormState)
  return (
    <form action={action} className="space-y-3">
      <Status state={state} />
      <ItemFields item={item} />
      <Field label="Safety data sheet (MSDS)" htmlFor="msds" hint="PDF or photo; replaces the current one">
        <Input id="msds" name="msds" type="file" accept="application/pdf,image/*" />
      </Field>
      <Button type="submit" loading={pending}>
        Save item
      </Button>
    </form>
  )
}

const MOVEMENT_KINDS = [
  { value: 'PURCHASE', label: 'Stock received (purchase)' },
  { value: 'BREAKAGE', label: 'Breakage' },
  { value: 'DISPOSAL', label: 'Write-off (expired / damaged)' },
  { value: 'ADJUSTMENT', label: 'Physical count correction' },
] as const

export function MovementForm({
  labId,
  items,
  defaultItemId,
}: {
  labId: string
  items: { id: string; label: string }[]
  defaultItemId?: string
}) {
  const [state, action, pending] = useActionState(movementAction.bind(null, labId), emptyFormState)
  const [type, setType] = useState<(typeof MOVEMENT_KINDS)[number]['value']>('PURCHASE')
  return (
    <form action={action} className="space-y-3">
      <Status state={state} />
      <Field label="Entry" htmlFor="type">
        <Select id="type" name="type" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
          {MOVEMENT_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Item" htmlFor="itemId" required>
        <Select id="itemId" name="itemId" defaultValue={defaultItemId ?? ''} required>
          <option value="" disabled>
            Choose an item
          </option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.label}
            </option>
          ))}
        </Select>
      </Field>
      {type === 'ADJUSTMENT' ? (
        <Field label="Quantity counted on the shelf" htmlFor="countedQty" required>
          <Input id="countedQty" name="countedQty" type="number" min={0} step="any" required />
        </Field>
      ) : (
        <Field label="Quantity" htmlFor="quantity" required>
          <Input id="quantity" name="quantity" type="number" min={0} step="any" required />
        </Field>
      )}
      {type === 'PURCHASE' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Unit cost (₹)" htmlFor="unitCost">
            <Input id="unitCost" name="unitCost" type="number" min={0} step="0.01" />
          </Field>
          <Field label="Expiry of this lot" htmlFor="expiresOn">
            <Input id="expiresOn" name="expiresOn" type="date" />
          </Field>
          <Field label="Supplier" htmlFor="vendorName">
            <Input id="vendorName" name="vendorName" />
          </Field>
          <Field label="Bill / invoice no." htmlFor="invoiceNo">
            <Input id="invoiceNo" name="invoiceNo" />
          </Field>
        </div>
      ) : null}
      {type === 'BREAKAGE' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Broken by (admission no.)" htmlFor="admissionNo" hint="Leave blank if not a student">
            <Input id="admissionNo" name="admissionNo" />
          </Field>
          <Field label="Amount to recover (₹)" htmlFor="charge">
            <Input id="charge" name="charge" type="number" min={0} step="0.01" />
          </Field>
        </div>
      ) : null}
      <Field
        label={type === 'ADJUSTMENT' || type === 'DISPOSAL' ? 'Reason' : 'Remarks'}
        htmlFor="reason"
        required={type === 'ADJUSTMENT' || type === 'DISPOSAL'}
      >
        <Input id="reason" name="reason" required={type === 'ADJUSTMENT' || type === 'DISPOSAL'} />
      </Field>
      <Button type="submit" loading={pending}>
        Record entry
      </Button>
    </form>
  )
}

export function CountForm({
  labId,
  rows,
}: {
  labId: string
  rows: { id: string; name: string; unit: string; requiredQty: number; quantity: number; category: string }[]
}) {
  const [state, action, pending] = useActionState(countAction.bind(null, labId), emptyFormState)
  return (
    <form action={action} className="space-y-3">
      <Status state={state} />
      <div className="max-h-[60vh] overflow-y-auto rounded-[var(--radius-sm)] border border-line scroll-thin">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-surface-2 text-xs text-ink-muted">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Item</th>
              <th className="px-3 py-2 text-right font-semibold">Required</th>
              <th className="px-3 py-2 text-right font-semibold">You have</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-1.5 text-ink">{r.name}</td>
                <td className="px-3 py-1.5 text-right tnum text-ink-muted">
                  {r.requiredQty} {r.unit}
                </td>
                <td className="px-3 py-1.5 text-right">
                  <Input
                    name={`count_${r.id}`}
                    type="number"
                    min={0}
                    step="any"
                    defaultValue={r.quantity}
                    className="ml-auto h-8 w-24 text-right"
                    aria-label={`${r.name} quantity in stock`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button type="submit" loading={pending}>
        Save stock count
      </Button>
    </form>
  )
}

/* ------------------------------------------------------------ practicals */

export function PracticalForm({
  experiment,
  catalogue,
}: {
  experiment?: {
    id: string
    labType: string
    classNumber: number | null
    subject: string | null
    title: string
    aim: string | null
    safetyNotes: string | null
    apparatus: { itemCode: string; qty: number }[]
  }
  catalogue: { code: string; name: string; unit: string; kind: string }[]
}) {
  const [state, action, pending] = useActionState(saveExperimentAction.bind(null, experiment?.id ?? null), emptyFormState)
  const [rows, setRows] = useState(experiment?.apparatus ?? [])
  const byCode = new Map(catalogue.map((c) => [c.code, c]))
  return (
    <form action={action} className="space-y-3">
      <Status state={state} />
      <input type="hidden" name="apparatus" value={JSON.stringify(rows.filter((r) => r.itemCode))} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Lab" htmlFor="labType">
          <Select id="labType" name="labType" defaultValue={experiment?.labType ?? 'COMPOSITE_SCIENCE'}>
            {LAB_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Class" htmlFor="classNumber">
          <Select id="classNumber" name="classNumber" defaultValue={experiment?.classNumber ?? ''}>
            <option value="">Any</option>
            {[6, 7, 8, 9, 10, 11, 12].map((n) => (
              <option key={n} value={n}>
                Class {n}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Subject" htmlFor="subject">
          <Select id="subject" name="subject" defaultValue={experiment?.subject ?? 'Science'}>
            {PRACTICAL_SUBJECTS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Title" htmlFor="title" required>
        <Input id="title" name="title" defaultValue={experiment?.title} required />
      </Field>
      <Field label="Aim" htmlFor="aim">
        <Textarea id="aim" name="aim" rows={2} defaultValue={experiment?.aim ?? ''} />
      </Field>
      <Field label="Safety notes" htmlFor="safetyNotes">
        <Input id="safetyNotes" name="safetyNotes" defaultValue={experiment?.safetyNotes ?? ''} />
      </Field>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-ink">
          Apparatus &amp; materials per session
          <span className="block text-xs font-normal text-ink-subtle">
            Consumables are deducted from the register when the session is completed.
          </span>
        </legend>
        {rows.map((row, i) => (
          <div key={i} className="flex items-center gap-2">
            <Select
              value={row.itemCode}
              onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, itemCode: e.target.value } : r)))}
              aria-label="Item"
              className="flex-1"
            >
              <option value="">Choose…</option>
              {catalogue.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name} ({c.unit}){c.kind === 'CONSUMABLE' ? ' · consumable' : ''}
                </option>
              ))}
            </Select>
            <Input
              type="number"
              min={0}
              step="any"
              value={row.qty}
              onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, qty: Number(e.target.value) } : r)))}
              className="w-24"
              aria-label="Quantity"
            />
            <span className="w-12 text-xs text-ink-subtle">{byCode.get(row.itemCode)?.unit}</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
              Remove
            </Button>
          </div>
        ))}
        <Button type="button" variant="secondary" size="sm" onClick={() => setRows([...rows, { itemCode: '', qty: 1 }])}>
          Add item
        </Button>
      </fieldset>
      <Button type="submit" loading={pending}>
        {experiment ? 'Save practical' : 'Add practical'}
      </Button>
    </form>
  )
}

/* -------------------------------------------------------------- sessions */

export function BookSessionForm({
  labs,
  sections,
  experiments,
  periods,
  staff,
  today,
}: {
  labs: Option[]
  sections: (Option & { classNumber: number })[]
  experiments: (Option & { classNumber: number | null })[]
  periods: { id: string; name: string; startTime: string; endTime: string }[]
  staff: Option[]
  today: string
}) {
  const [state, action, pending] = useActionState(bookSessionAction, emptyFormState)
  const [sectionId, setSectionId] = useState('')
  const [periodId, setPeriodId] = useState('')
  const classNumber = sections.find((s) => s.id === sectionId)?.classNumber
  const shown = classNumber ? experiments.filter((e) => e.classNumber === null || e.classNumber === classNumber) : experiments
  return (
    <form action={action} className="space-y-3">
      <Status state={state} />
      <Field label="Lab" htmlFor="labId" required>
        <Select id="labId" name="labId" defaultValue={labs[0]?.id ?? ''} required>
          {labs.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Class" htmlFor="sectionId" required>
        <Select id="sectionId" name="sectionId" value={sectionId} onChange={(e) => setSectionId(e.target.value)} required>
          <option value="" disabled>
            Choose a class
          </option>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Practical" htmlFor="experimentId">
        <Select id="experimentId" name="experimentId" defaultValue="">
          <option value="">Choose later</option>
          {shown.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Date" htmlFor="date" required>
          <Input id="date" name="date" type="date" min={today} defaultValue={today} required />
        </Field>
        <Field label="Period" htmlFor="periodId" hint="Uses the timetable times and teacher">
          <Select id="periodId" name="periodId" value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
            <option value="">Custom time</option>
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.startTime}–{p.endTime}
              </option>
            ))}
          </Select>
        </Field>
        {!periodId ? (
          <>
            <Field label="Starts" htmlFor="startTime" required>
              <Input id="startTime" name="startTime" type="time" required />
            </Field>
            <Field label="Ends" htmlFor="endTime" required>
              <Input id="endTime" name="endTime" type="time" required />
            </Field>
          </>
        ) : null}
        <Field label="Batch" htmlFor="batch" hint="If the class is split, e.g. Group A">
          <Input id="batch" name="batch" />
        </Field>
        <StaffSelect name="teacherStaffId" staff={staff} label="Teacher" />
      </div>
      <Button type="submit" loading={pending}>
        Book lab
      </Button>
    </form>
  )
}

/* ---------------------------------------------------------------- safety */

export function InspectionForm({
  labId,
  specs,
  today,
}: {
  labId: string
  specs: { type: string; label: string; items: ChecklistItem[] }[]
  today: string
}) {
  const [state, action, pending] = useActionState(inspectionAction.bind(null, labId), emptyFormState)
  const [type, setType] = useState(specs.find((s) => s.type === 'MONTHLY')?.type ?? specs[0]?.type ?? 'MONTHLY')
  const spec = specs.find((s) => s.type === type)
  return (
    <form action={action} className="space-y-3" key={type}>
      <Status state={state} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Inspection" htmlFor="type">
          <Select id="type" name="type" value={type} onChange={(e) => setType(e.target.value)}>
            {specs.map((s) => (
              <option key={s.type} value={s.type}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date" htmlFor="inspectedOn">
          <Input id="inspectedOn" name="inspectedOn" type="date" max={today} defaultValue={today} required />
        </Field>
      </div>
      <ul className="space-y-1.5">
        {spec?.items.map((i) => (
          <li key={i.code}>
            <label className="flex items-start gap-2 text-sm text-ink">
              <Checkbox name={`check_${i.code}`} className="mt-0.5" />
              {i.label}
            </label>
          </li>
        ))}
      </ul>
      <Field label="Issues found and action" htmlFor="issues" hint="Required if any check is left unticked">
        <Textarea id="issues" name="issues" rows={2} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Inspected by" htmlFor="inspectorName">
          <Input id="inspectorName" name="inspectorName" placeholder="Defaults to you" />
        </Field>
        <Field label="Photos" htmlFor="photos" hint="Up to 6">
          <Input id="photos" name="photos" type="file" accept="image/*,application/pdf" multiple />
        </Field>
      </div>
      <Button type="submit" loading={pending}>
        Record inspection
      </Button>
    </form>
  )
}

export function IncidentForm({ labId }: { labId: string }) {
  const [state, action, pending] = useActionState(incidentAction.bind(null, labId), emptyFormState)
  return (
    <form action={action} className="space-y-3">
      <Status state={state} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="When" htmlFor="occurredAt" required>
          <Input id="occurredAt" name="occurredAt" type="datetime-local" required />
        </Field>
        <Field label="Type" htmlFor="type">
          <Select id="type" name="type" defaultValue="INJURY">
            {INCIDENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Severity" htmlFor="severity">
          <Select id="severity" name="severity" defaultValue="MINOR">
            {INCIDENT_SEVERITIES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="What happened" htmlFor="description" required>
        <Textarea id="description" name="description" rows={3} required />
      </Field>
      <Field label="Students involved (admission numbers)" htmlFor="admissionNos" hint="Separate with commas">
        <Input id="admissionNos" name="admissionNos" />
      </Field>
      <Field label="Action taken" htmlFor="actionTaken">
        <Textarea id="actionTaken" name="actionTaken" rows={2} />
      </Field>
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm text-ink">
          <Checkbox name="firstAidGiven" /> First aid given
        </label>
        <label className="flex items-center gap-2 text-sm text-ink">
          <Checkbox name="parentInformed" /> Parents informed
        </label>
      </div>
      <Field label="Photos" htmlFor="incidentPhotos" hint="Up to 6">
        <Input id="incidentPhotos" name="photos" type="file" accept="image/*,application/pdf" multiple />
      </Field>
      <Button type="submit" variant="danger" loading={pending}>
        Report incident
      </Button>
    </form>
  )
}

export function CloseIncidentForm({ labId, incidentId }: { labId: string; incidentId: string }) {
  const [state, action, pending] = useActionState(closeIncidentAction.bind(null, labId), emptyFormState)
  return (
    <form action={action} className="mt-2 space-y-2">
      <Status state={state} />
      <input type="hidden" name="incidentId" value={incidentId} />
      <Textarea name="actionTaken" rows={2} placeholder="Action taken and follow-up" aria-label="Action taken" required />
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-ink">
          <Checkbox name="parentInformed" /> Parents informed
        </label>
        <Button type="submit" size="sm" variant="secondary" loading={pending}>
          Close incident
        </Button>
      </div>
    </form>
  )
}

export function WasteForm({ labId, today }: { labId: string; today: string }) {
  const [state, action, pending] = useActionState(wasteAction.bind(null, labId), emptyFormState)
  return (
    <form action={action} className="space-y-3">
      <Status state={state} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Date" htmlFor="disposedOn">
          <Input id="disposedOn" name="disposedOn" type="date" max={today} defaultValue={today} required />
        </Field>
        <Field label="Waste" htmlFor="category">
          <Select id="category" name="category" defaultValue="NON_BIODEGRADABLE">
            {WASTE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Quantity" htmlFor="wasteQty">
          <Input id="wasteQty" name="quantity" type="number" min={0} step="any" />
        </Field>
        <Field label="Unit" htmlFor="wasteUnit">
          <Input id="wasteUnit" name="unit" placeholder="kg, bottles, bags" />
        </Field>
      </div>
      <Field label="Handed to" htmlFor="handedTo" hint="Agency, municipal collector or MMD">
        <Input id="handedTo" name="handedTo" />
      </Field>
      <Field label="Notes" htmlFor="wasteNotes">
        <Input id="wasteNotes" name="notes" />
      </Field>
      <Button type="submit" loading={pending}>
        Log disposal
      </Button>
    </form>
  )
}
