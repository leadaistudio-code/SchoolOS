'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Layers, Plus, Trash2 } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { createFeeHeadAction, createStructureAction } from '../actions'

export type FeeHeadOption = {
  id: string
  code: string
  name: string
  frequency: string
}

export type ClassOption = { id: string; label: string }

const FREQUENCIES = [
  { value: 'ONE_TIME', label: 'One time' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'QUARTERLY', label: 'Quarterly' },
  { value: 'HALF_YEARLY', label: 'Half yearly' },
  { value: 'ANNUAL', label: 'Annual' },
] as const

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
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Code" htmlFor="fee-head-code" required hint="Short code, e.g. TUI">
            <Input
              id="fee-head-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="TUI"
              autoFocus
            />
          </Field>
          <Field label="Name" htmlFor="fee-head-name" required>
            <Input
              id="fee-head-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tuition fee"
            />
          </Field>
          <Field label="Frequency" htmlFor="fee-head-frequency" className="sm:col-span-2">
            <Select
              id="fee-head-frequency"
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
      </Dialog>
    </>
  )
}

type StructureLine = { feeHeadId: string; amount: string; dueOn: string }

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
        ? [{ feeHeadId: feeHeads[0]!.id, amount: '', dueOn: '' }]
        : [],
    )
    setOpen(true)
  }

  const addLine = () => {
    const used = new Set(lines.map((l) => l.feeHeadId))
    const next = feeHeads.find((h) => !used.has(h.id))
    if (!next) return
    setLines((prev) => [...prev, { feeHeadId: next.id, amount: '', dueOn: '' }])
  }

  const updateLine = (index: number, patch: Partial<StructureLine>) => {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)))
  }

  const removeLine = (index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index))
  }

  const submit = () =>
    startTransition(async () => {
      const items = lines
        .filter((l) => l.feeHeadId && l.amount.trim() !== '' && Number(l.amount) > 0)
        .map((l) => ({
          feeHeadId: l.feeHeadId,
          amount: Number(l.amount),
          dueOn: l.dueOn.trim() || undefined,
        }))

      const result = await createStructureAction({
        name: name.trim(),
        classLevelId: classLevelId || undefined,
        description: description.trim() || undefined,
        items,
      })

      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Could not create structure', description: result.message })
        return
      }

      toast.push({ tone: 'success', title: 'Fee structure created', description: result.message })
      setOpen(false)
      router.refresh()
    })

  const canAddLine = lines.length < feeHeads.length
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

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-ink">Fee lines</p>
              {canAddLine ? (
                <Button size="sm" variant="ghost" type="button" onClick={addLine}>
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
                    <Field label="Fee head" htmlFor={`structure-head-${index}`}>
                      <Select
                        id={`structure-head-${index}`}
                        value={line.feeHeadId}
                        onChange={(e) => updateLine(index, { feeHeadId: e.target.value })}
                      >
                        {feeHeads.map((h) => (
                          <option key={h.id} value={h.id}>
                            {h.name} ({h.code})
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Amount (₹)" htmlFor={`structure-amt-${index}`} required>
                      <Input
                        id={`structure-amt-${index}`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.amount}
                        onChange={(e) => updateLine(index, { amount: e.target.value })}
                        placeholder="0"
                      />
                    </Field>
                    <Field label="Due date" htmlFor={`structure-due-${index}`} hint="Optional">
                      <Input
                        id={`structure-due-${index}`}
                        type="date"
                        value={line.dueOn}
                        onChange={(e) => updateLine(index, { dueOn: e.target.value })}
                      />
                    </Field>
                    <div className="flex items-end pb-0.5">
                      <IconButton
                        label="Remove line"
                        disabled={lines.length <= 1}
                        onClick={() => removeLine(index)}
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </IconButton>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Dialog>
    </>
  )
}
