'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { FileStack } from 'lucide-react'
import { generateInvoicesAction } from '../actions'
import type { GenerationResult } from '@/server/modules/finance/service'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Checkbox, Field, Input, Select } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { formatMoney } from '@/lib/utils'
import { toDateInput } from '@/lib/dates'

type Structure = { id: string; name: string; className: string; totalMinor: number }
type ClassNode = { id: string; name: string; sections: { id: string; name: string }[] }

/**
 * Bulk invoice generation for one or many fee structures in a single run.
 * Optional add-ons (e.g. Computer Science) are included only for opted-in students,
 * on the same invoice as the base fee.
 */
export function GenerateInvoices({
  structures,
  classes,
  currency,
}: {
  structures: Structure[]
  classes: ClassNode[]
  currency: string
}) {
  const router = useRouter()
  const toast = useToast()

  const [open, setOpen] = React.useState(false)
  const [structureIds, setStructureIds] = React.useState<string[]>(
    structures[0] ? [structures[0].id] : [],
  )
  const [classLevelId, setClassLevelId] = React.useState('')
  const [sectionId, setSectionId] = React.useState('')
  const [title, setTitle] = React.useState('')
  const [issuedOn, setIssuedOn] = React.useState(toDateInput(new Date()))
  const [dueOn, setDueOn] = React.useState(
    toDateInput(new Date(Date.now() + 14 * 86_400_000)),
  )
  const [preview, setPreview] = React.useState<GenerationResult | null>(null)
  const [pending, startTransition] = React.useTransition()

  const sections = classes.find((c) => c.id === classLevelId)?.sections ?? []

  const toggleStructure = (id: string) => {
    setPreview(null)
    setStructureIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  const selectAllStructures = () => {
    setPreview(null)
    setStructureIds(structures.map((s) => s.id))
  }

  const run = (dryRun: boolean) => {
    startTransition(async () => {
      const result = await generateInvoicesAction({
        structureIds,
        classLevelId: classLevelId || undefined,
        sectionId: sectionId || undefined,
        title,
        issuedOn,
        dueOn,
        dryRun,
      })

      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Could not generate', description: result.message })
        return
      }

      if (dryRun) {
        setPreview(result.data ?? null)
        return
      }

      toast.push({ tone: 'success', title: 'Invoices generated', description: result.message })
      setOpen(false)
      setPreview(null)
      setTitle('')
      router.refresh()
    })
  }

  if (structures.length === 0) return null

  const willBill = preview?.preview.filter((p) => !p.skipReason) ?? []
  const withOptional = willBill.filter((p) => p.optionalMinor > 0).length

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <FileStack aria-hidden />
        Generate invoices
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Generate invoices"
        size="lg"
        description="Select one or more structures. Each student gets a single invoice; optional add-ons (like Computer Science) are included only for students who opted in."
        footer={
          <>
            {!preview ? (
              <Button
                onClick={() => run(true)}
                loading={pending}
                disabled={!title.trim() || structureIds.length === 0}
              >
                Preview
              </Button>
            ) : (
              <>
                <Button onClick={() => run(false)} loading={pending} disabled={willBill.length === 0}>
                  Generate {willBill.length} invoices
                </Button>
                <Button variant="secondary" onClick={() => setPreview(null)}>
                  Change settings
                </Button>
              </>
            )}
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Fee structures"
            htmlFor="gen-structures"
            required
            hint="Tick every class package you want billed in this run"
            className="sm:col-span-2"
          >
            <div className="rounded-[var(--radius-sm)] border border-line divide-y divide-[var(--border)] max-h-40 overflow-y-auto scroll-thin">
              <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-surface-2">
                <span className="text-xs text-ink-muted">
                  {structureIds.length} of {structures.length} selected
                </span>
                <Button size="sm" variant="ghost" type="button" onClick={selectAllStructures}>
                  Select all
                </Button>
              </div>
              {structures.map((s) => (
                <label
                  key={s.id}
                  className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-surface-2"
                >
                  <Checkbox
                    checked={structureIds.includes(s.id)}
                    onChange={() => toggleStructure(s.id)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-ink truncate">{s.name}</span>
                    <span className="block text-xs text-ink-subtle">
                      {s.className} · {formatMoney(s.totalMinor, currency)} base
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </Field>

          <Field
            label="Invoice title"
            htmlFor="gen-title"
            required
            hint="Same title for every invoice in this batch, e.g. Term 2 — 2025-26"
            className="sm:col-span-2"
          >
            <Input
              id="gen-title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                setPreview(null)
              }}
              placeholder="Term 2 — 2025-26"
            />
          </Field>

          <Field label="Class filter" htmlFor="gen-class" hint="Optional — narrow who is billed">
            <Select
              id="gen-class"
              value={classLevelId}
              onChange={(e) => {
                setClassLevelId(e.target.value)
                setSectionId('')
                setPreview(null)
              }}
            >
              <option value="">All classes in selected structures</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Section" htmlFor="gen-section">
            <Select
              id="gen-section"
              value={sectionId}
              disabled={!classLevelId}
              onChange={(e) => {
                setSectionId(e.target.value)
                setPreview(null)
              }}
            >
              <option value="">All sections</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  Section {s.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Issued on" htmlFor="gen-issued" required>
            <Input
              id="gen-issued"
              type="date"
              value={issuedOn}
              onChange={(e) => setIssuedOn(e.target.value)}
            />
          </Field>

          <Field label="Due on" htmlFor="gen-due" required>
            <Input
              id="gen-due"
              type="date"
              min={issuedOn}
              value={dueOn}
              onChange={(e) => setDueOn(e.target.value)}
            />
          </Field>
        </div>

        {preview ? (
          <div className="mt-4 border border-line rounded-[var(--radius)] overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 bg-surface-2 border-b border-line">
              <p className="text-sm text-ink">
                <span className="font-medium">{willBill.length}</span> to bill
                {withOptional > 0 ? (
                  <span className="text-ink-muted"> · {withOptional} with optional add-on</span>
                ) : null}
                {preview.skipped > 0 ? (
                  <span className="text-ink-muted"> · {preview.skipped} skipped</span>
                ) : null}
              </p>
              <p className="text-base font-semibold tnum text-ink">
                {formatMoney(preview.totalMinor, currency)}
              </p>
            </div>

            <ul className="max-h-56 overflow-y-auto scroll-thin divide-y divide-[var(--border)]">
              {preview.preview.slice(0, 80).map((p) => (
                <li
                  key={`${p.structureName}-${p.studentId}`}
                  className="flex items-center justify-between gap-3 px-3.5 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-ink truncate">{p.studentName}</p>
                    <p className="text-xs text-ink-subtle tnum">
                      {p.admissionNo} · {p.structureName}
                      {p.optionalMinor > 0 && !p.skipReason
                        ? ` · +${formatMoney(p.optionalMinor, currency)} optional`
                        : ''}
                    </p>
                  </div>
                  {p.skipReason ? (
                    <span className="text-xs text-ink-subtle shrink-0">{p.skipReason}</span>
                  ) : (
                    <span className="text-xs tnum text-ink shrink-0">
                      {formatMoney(p.netMinor, currency)}
                      {p.discountMinor > 0 ? (
                        <span className="text-success">
                          {' '}
                          (−{formatMoney(p.discountMinor, currency)})
                        </span>
                      ) : null}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {preview.preview.length > 80 ? (
              <p className="px-3.5 py-2 text-xs text-ink-subtle border-t border-line">
                Showing the first 80 of {preview.preview.length}.
              </p>
            ) : null}
          </div>
        ) : null}
      </Dialog>
    </>
  )
}
