'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Layers, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import {
  createFeeHeadAction,
  createStructureAction,
  deleteFeeHeadAction,
  deleteStructureAction,
  updateFeeHeadAction,
  updateStructureAction,
} from '../actions'

export type FeeHeadOption = {
  id: string
  code: string
  name: string
  frequency: string
}

export type ClassOption = { id: string; label: string }

export type FeeHeadDraft = FeeHeadOption & {
  isRefundable: boolean
  isDeposit: boolean
  inUseCount: number
}

export type StructureDraft = {
  id: string
  name: string
  classLevelId: string
  description: string
  invoiceCount: number
  items: { feeHeadId: string; amountMinor: number; dueOn: string; isOptional?: boolean }[]
}

const FREQUENCIES = [
  { value: 'ONE_TIME', label: 'One time' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'QUARTERLY', label: 'Quarterly' },
  { value: 'HALF_YEARLY', label: 'Half yearly' },
  { value: 'ANNUAL', label: 'Annual' },
] as const

function FeeHeadFields({
  idPrefix,
  code,
  setCode,
  name,
  setName,
  frequency,
  setFrequency,
  isRefundable,
  setIsRefundable,
  isDeposit,
  setIsDeposit,
  autoFocus,
}: {
  idPrefix: string
  code: string
  setCode: (v: string) => void
  name: string
  setName: (v: string) => void
  frequency: string
  setFrequency: (v: string) => void
  isRefundable: boolean
  setIsRefundable: (v: boolean) => void
  isDeposit: boolean
  setIsDeposit: (v: boolean) => void
  autoFocus?: boolean
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Code" htmlFor={`${idPrefix}-code`} required hint="Short code, e.g. TUI">
        <Input
          id={`${idPrefix}-code`}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="TUI"
          autoFocus={autoFocus}
        />
      </Field>
      <Field label="Name" htmlFor={`${idPrefix}-name`} required>
        <Input
          id={`${idPrefix}-name`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Tuition fee"
        />
      </Field>
      <Field label="Frequency" htmlFor={`${idPrefix}-frequency`} className="sm:col-span-2">
        <Select
          id={`${idPrefix}-frequency`}
          value={frequency}
          onChange={(e) => setFrequency(e.target.value)}
        >
          {FREQUENCIES.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </Select>
      </Field>
      <label className="flex items-center gap-2 sm:col-span-2">
        <Checkbox checked={isDeposit} onChange={(e) => setIsDeposit(e.target.checked)} />
        <span className="text-sm text-ink">Security / caution deposit</span>
      </label>
      <label className="flex items-center gap-2 sm:col-span-2">
        <Checkbox checked={isRefundable} onChange={(e) => setIsRefundable(e.target.checked)} />
        <span className="text-sm text-ink">Refundable when the student leaves</span>
      </label>
    </div>
  )
}

type StructureLine = { feeHeadId: string; amount: string; dueOn: string; isOptional: boolean }

function StructureLinesEditor({
  idPrefix,
  feeHeads,
  lines,
  onAddLine,
  onUpdateLine,
  onRemoveLine,
}: {
  idPrefix: string
  feeHeads: FeeHeadOption[]
  lines: StructureLine[]
  onAddLine: () => void
  onUpdateLine: (index: number, patch: Partial<StructureLine>) => void
  onRemoveLine: (index: number) => void
}) {
  const canAddLine = lines.length < feeHeads.length

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-ink">Fee lines</p>
        {canAddLine ? (
          <Button size="sm" variant="ghost" type="button" onClick={onAddLine}>
            <Plus aria-hidden /> Add line
          </Button>
        ) : null}
      </div>

      {lines.length === 0 ? (
        <p className="text-sm text-warning">Add fee heads first, then return here.</p>
      ) : (
        <ul className="space-y-2">
          {lines.map((line, index) => (
            <li
              key={`${line.feeHeadId}-${index}`}
              className="grid gap-2 rounded-[var(--radius-sm)] border border-line p-2 sm:grid-cols-[1fr_7rem_9rem_auto]"
            >
              <Field label="Fee head" htmlFor={`${idPrefix}-head-${index}`}>
                <Select
                  id={`${idPrefix}-head-${index}`}
                  value={line.feeHeadId}
                  onChange={(e) => onUpdateLine(index, { feeHeadId: e.target.value })}
                >
                  {feeHeads.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name} ({h.code})
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Amount (₹)" htmlFor={`${idPrefix}-amt-${index}`} required>
                <Input
                  id={`${idPrefix}-amt-${index}`}
                  type="number"
                  min="0"
                  step="0.01"
                  value={line.amount}
                  onChange={(e) => onUpdateLine(index, { amount: e.target.value })}
                  placeholder="0"
                />
              </Field>
              <Field label="Due date" htmlFor={`${idPrefix}-due-${index}`} hint="Optional">
                <Input
                  id={`${idPrefix}-due-${index}`}
                  type="date"
                  value={line.dueOn}
                  onChange={(e) => onUpdateLine(index, { dueOn: e.target.value })}
                />
              </Field>
              <div className="flex items-end pb-0.5">
                <IconButton
                  label="Remove line"
                  disabled={lines.length <= 1}
                  onClick={() => onRemoveLine(index)}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </IconButton>
              </div>
              <label className="flex items-center gap-2 sm:col-span-4">
                <Checkbox
                  checked={line.isOptional}
                  onChange={(e) => onUpdateLine(index, { isOptional: e.target.checked })}
                />
                <span className="text-sm text-ink">
                  Optional add-on — only billed for students who opted in (e.g. Computer Science ₹500)
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function structureItemsFromLines(lines: StructureLine[]) {
  return lines
    .filter((l) => l.feeHeadId && l.amount.trim() !== '' && Number(l.amount) > 0)
    .map((l) => ({
      feeHeadId: l.feeHeadId,
      amount: Number(l.amount),
      dueOn: l.dueOn.trim() || undefined,
      isOptional: l.isOptional,
    }))
}

export function NewFeeHeadButton({ label = 'New fee head' }: { label?: string }) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const [code, setCode] = React.useState('')
  const [name, setName] = React.useState('')
  const [frequency, setFrequency] = React.useState<string>('ANNUAL')
  const [isRefundable, setIsRefundable] = React.useState(false)
  const [isDeposit, setIsDeposit] = React.useState(false)

  const reset = () => {
    setCode('')
    setName('')
    setFrequency('ANNUAL')
    setIsRefundable(false)
    setIsDeposit(false)
  }

  const submit = () =>
    startTransition(async () => {
      const result = await createFeeHeadAction({
        code: code.trim().toUpperCase(),
        name: name.trim(),
        frequency,
        isRefundable,
        isDeposit,
      })
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Could not create fee head', description: result.message })
        return
      }
      toast.push({ tone: 'success', title: 'Fee head created', description: result.message })
      setOpen(false)
      reset()
      router.refresh()
    })

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Plus aria-hidden /> {label}
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="New fee head"
        description="A fee head is a type of charge — tuition, transport, exam fee, and so on."
        footer={
          <>
            <Button onClick={submit} loading={pending} disabled={!code.trim() || !name.trim()}>
              Create fee head
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </>
        }
      >
        <FeeHeadFields
          idPrefix="new-fee-head"
          code={code}
          setCode={setCode}
          name={name}
          setName={setName}
          frequency={frequency}
          setFrequency={setFrequency}
          isRefundable={isRefundable}
          setIsRefundable={setIsRefundable}
          isDeposit={isDeposit}
          setIsDeposit={setIsDeposit}
          autoFocus
        />
      </Dialog>
    </>
  )
}

export function EditFeeHeadButton({ head }: { head: FeeHeadDraft }) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const [code, setCode] = React.useState(head.code)
  const [name, setName] = React.useState(head.name)
  const [frequency, setFrequency] = React.useState(head.frequency)
  const [isRefundable, setIsRefundable] = React.useState(head.isRefundable)
  const [isDeposit, setIsDeposit] = React.useState(head.isDeposit)
  const [confirmRemove, setConfirmRemove] = React.useState(false)

  const openDialog = () => {
    setCode(head.code)
    setName(head.name)
    setFrequency(head.frequency)
    setIsRefundable(head.isRefundable)
    setIsDeposit(head.isDeposit)
    setConfirmRemove(false)
    setOpen(true)
  }

  const submit = () =>
    startTransition(async () => {
      const result = await updateFeeHeadAction({
        id: head.id,
        code: code.trim().toUpperCase(),
        name: name.trim(),
        frequency,
        isRefundable,
        isDeposit,
      })
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Could not update fee head', description: result.message })
        return
      }
      toast.push({ tone: 'success', title: 'Fee head updated', description: result.message })
      setOpen(false)
      router.refresh()
    })

  const remove = () =>
    startTransition(async () => {
      const result = await deleteFeeHeadAction(head.id)
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Could not remove fee head', description: result.message })
        return
      }
      toast.push({ tone: 'success', title: 'Fee head removed', description: result.message })
      setOpen(false)
      router.refresh()
    })

  return (
    <>
      <IconButton label={`Edit ${head.name}`} onClick={openDialog}>
        <Pencil className="size-3.5" aria-hidden />
      </IconButton>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Edit ${head.name}`}
        description="Change the name, code, frequency or flags for this fee type."
        footer={
          <>
            <Button onClick={submit} loading={pending} disabled={!code.trim() || !name.trim()}>
              Save changes
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </>
        }
      >
        <FeeHeadFields
          idPrefix={`edit-fee-head-${head.id}`}
          code={code}
          setCode={setCode}
          name={name}
          setName={setName}
          frequency={frequency}
          setFrequency={setFrequency}
          isRefundable={isRefundable}
          setIsRefundable={setIsRefundable}
          isDeposit={isDeposit}
          setIsDeposit={setIsDeposit}
        />

        <div className="mt-4 border-t border-line pt-3">
          {head.inUseCount > 0 ? (
            <p className="text-sm text-ink-muted">
              Used in {head.inUseCount} structure line(s). Remove it from structures before deleting.
            </p>
          ) : confirmRemove ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-ink-muted">Remove this fee head permanently?</p>
              <Button size="sm" variant="danger" loading={pending} onClick={remove}>
                Remove
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(false)}>
                Keep
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(true)}>
              <Trash2 aria-hidden /> Remove fee head
            </Button>
          )}
        </div>
      </Dialog>
    </>
  )
}

export function NewStructureButton({
  feeHeads,
  classes,
  label = 'New fee structure',
}: {
  feeHeads: FeeHeadOption[]
  classes: ClassOption[]
  label?: string
}) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const [name, setName] = React.useState('')
  const [classLevelId, setClassLevelId] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [lines, setLines] = React.useState<StructureLine[]>([])

  const openDialog = () => {
    setName('')
    setClassLevelId('')
    setDescription('')
    setLines(
      feeHeads.length > 0
        ? [{ feeHeadId: feeHeads[0]!.id, amount: '', dueOn: '', isOptional: false }]
        : [],
    )
    setOpen(true)
  }

  const addLine = () => {
    const used = new Set(lines.map((l) => l.feeHeadId))
    const next = feeHeads.find((h) => !used.has(h.id))
    if (!next) return
    setLines((prev) => [...prev, { feeHeadId: next.id, amount: '', dueOn: '', isOptional: false }])
  }

  const updateLine = (index: number, patch: Partial<StructureLine>) => {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)))
  }

  const removeLine = (index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index))
  }

  const submit = () =>
    startTransition(async () => {
      const result = await createStructureAction({
        name: name.trim(),
        classLevelId: classLevelId || undefined,
        description: description.trim() || undefined,
        items: structureItemsFromLines(lines),
      })

      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Could not create structure', description: result.message })
        return
      }

      toast.push({ tone: 'success', title: 'Fee structure created', description: result.message })
      setOpen(false)
      router.refresh()
    })

  const validLines = lines.some((l) => l.feeHeadId && Number(l.amount) > 0)

  return (
    <>
      <Button
        size="sm"
        onClick={openDialog}
        disabled={feeHeads.length === 0}
        title={feeHeads.length === 0 ? 'Create at least one fee head first' : 'Build a fee package for a class'}
      >
        <Layers aria-hidden /> {label}
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="New fee structure"
        description="Group fee heads and amounts for a class. Invoices are generated from this structure."
        footer={
          <>
            <Button onClick={submit} loading={pending} disabled={!name.trim() || !validLines}>
              Create structure
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </>
        }
      >
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Structure name" htmlFor="structure-name" required className="sm:col-span-2">
              <Input
                id="structure-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Class 6 — Term 1"
                autoFocus
              />
            </Field>
            <Field label="Class" htmlFor="structure-class" hint="Leave blank for all classes">
              <Select
                id="structure-class"
                value={classLevelId}
                onChange={(e) => setClassLevelId(e.target.value)}
              >
                <option value="">All classes</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Description" htmlFor="structure-desc" className="sm:col-span-2">
              <Textarea
                id="structure-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Optional note for staff"
              />
            </Field>
          </div>

          <StructureLinesEditor
            idPrefix="new-structure"
            feeHeads={feeHeads}
            lines={lines}
            onAddLine={addLine}
            onUpdateLine={updateLine}
            onRemoveLine={removeLine}
          />
        </div>
      </Dialog>
    </>
  )
}

function StructureFormFields({
  idPrefix,
  name,
  setName,
  classLevelId,
  setClassLevelId,
  description,
  setDescription,
  classes,
  feeHeads,
  lines,
  onAddLine,
  onUpdateLine,
  onRemoveLine,
  autoFocus,
}: {
  idPrefix: string
  name: string
  setName: (v: string) => void
  classLevelId: string
  setClassLevelId: (v: string) => void
  description: string
  setDescription: (v: string) => void
  classes: ClassOption[]
  feeHeads: FeeHeadOption[]
  lines: StructureLine[]
  onAddLine: () => void
  onUpdateLine: (index: number, patch: Partial<StructureLine>) => void
  onRemoveLine: (index: number) => void
  autoFocus?: boolean
}) {
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Structure name" htmlFor={`${idPrefix}-name`} required className="sm:col-span-2">
          <Input
            id={`${idPrefix}-name`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Class 6 — Term 1"
            autoFocus={autoFocus}
          />
        </Field>
        <Field label="Class" htmlFor={`${idPrefix}-class`} hint="Leave blank for all classes">
          <Select
            id={`${idPrefix}-class`}
            value={classLevelId}
            onChange={(e) => setClassLevelId(e.target.value)}
          >
            <option value="">All classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Description" htmlFor={`${idPrefix}-desc`} className="sm:col-span-2">
          <Textarea
            id={`${idPrefix}-desc`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Optional note for staff"
          />
        </Field>
      </div>

      <StructureLinesEditor
        idPrefix={idPrefix}
        feeHeads={feeHeads}
        lines={lines}
        onAddLine={onAddLine}
        onUpdateLine={onUpdateLine}
        onRemoveLine={onRemoveLine}
      />
    </div>
  )
}

export function EditStructureButton({
  structure,
  feeHeads,
  classes,
}: {
  structure: StructureDraft
  feeHeads: FeeHeadOption[]
  classes: ClassOption[]
}) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const [name, setName] = React.useState(structure.name)
  const [classLevelId, setClassLevelId] = React.useState(structure.classLevelId)
  const [description, setDescription] = React.useState(structure.description)
  const [lines, setLines] = React.useState<StructureLine[]>([])
  const [confirmRemove, setConfirmRemove] = React.useState(false)

  const locked = structure.invoiceCount > 0

  const openDialog = () => {
    setName(structure.name)
    setClassLevelId(structure.classLevelId)
    setDescription(structure.description)
    setLines(
      structure.items.map((item) => ({
        feeHeadId: item.feeHeadId,
        amount: String(item.amountMinor / 100),
        dueOn: item.dueOn,
        isOptional: Boolean(item.isOptional),
      })),
    )
    setConfirmRemove(false)
    setOpen(true)
  }

  const addLine = () => {
    const used = new Set(lines.map((l) => l.feeHeadId))
    const next = feeHeads.find((h) => !used.has(h.id))
    if (!next) return
    setLines((prev) => [...prev, { feeHeadId: next.id, amount: '', dueOn: '', isOptional: false }])
  }

  const updateLine = (index: number, patch: Partial<StructureLine>) => {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)))
  }

  const removeLine = (index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index))
  }

  const submit = () =>
    startTransition(async () => {
      const result = await updateStructureAction({
        id: structure.id,
        name: name.trim(),
        classLevelId: classLevelId || undefined,
        description: description.trim() || undefined,
        items: structureItemsFromLines(lines),
      })
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Could not update structure', description: result.message })
        return
      }
      toast.push({ tone: 'success', title: 'Structure updated', description: result.message })
      setOpen(false)
      router.refresh()
    })

  const remove = () =>
    startTransition(async () => {
      const result = await deleteStructureAction(structure.id)
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Could not remove structure', description: result.message })
        return
      }
      toast.push({ tone: 'success', title: 'Structure removed', description: result.message })
      setOpen(false)
      router.refresh()
    })

  const validLines = lines.some((l) => l.feeHeadId && Number(l.amount) > 0)

  return (
    <>
      <IconButton label={`Edit ${structure.name}`} onClick={openDialog}>
        <Pencil className="size-3.5" aria-hidden />
      </IconButton>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Edit ${structure.name}`}
        description={
          locked
            ? 'Invoices have already been generated, so this structure is read-only.'
            : 'Change the class, amounts or fee lines for this package.'
        }
        footer={
          locked ? (
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Close
            </Button>
          ) : (
            <>
              <Button onClick={submit} loading={pending} disabled={!name.trim() || !validLines}>
                Save changes
              </Button>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </>
          )
        }
      >
        {locked ? (
          <p className="text-sm text-ink-muted">
            {structure.invoiceCount} invoice(s) were generated from this structure. Create a new
            structure if you need different amounts.
          </p>
        ) : (
          <StructureFormFields
            idPrefix={`edit-structure-${structure.id}`}
            name={name}
            setName={setName}
            classLevelId={classLevelId}
            setClassLevelId={setClassLevelId}
            description={description}
            setDescription={setDescription}
            classes={classes}
            feeHeads={feeHeads}
            lines={lines}
            onAddLine={addLine}
            onUpdateLine={updateLine}
            onRemoveLine={removeLine}
          />
        )}

        {!locked ? (
          <div className="mt-4 border-t border-line pt-3">
            {confirmRemove ? (
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm text-ink-muted">Remove this fee structure?</p>
                <Button size="sm" variant="danger" loading={pending} onClick={remove}>
                  Remove
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(false)}>
                  Keep
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(true)}>
                <Trash2 aria-hidden /> Remove structure
              </Button>
            )}
          </div>
        ) : null}
      </Dialog>
    </>
  )
}
