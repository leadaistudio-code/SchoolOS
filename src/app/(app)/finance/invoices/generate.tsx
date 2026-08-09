'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { FileStack, Loader2 } from 'lucide-react'
import { generateInvoicesAction } from '../actions'
import type { GenerationResult } from '@/server/modules/finance/service'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { formatMoney } from '@/lib/utils'
import { toDateInput } from '@/lib/dates'

type Structure = { id: string; name: string; className: string; totalMinor: number }
type ClassNode = { id: string; name: string; sections: { id: string; name: string }[] }

/**
 * Bulk invoice generation.
 *
 * Always previews first. Billing a whole school is the most expensive button in
 * the product, and the operator should see exactly who will be charged, how
 * much, and who is being skipped as already invoiced — before anything is
 * written.
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
  const [structureId, setStructureId] = React.useState(structures[0]?.id ?? '')
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

  const run = (dryRun: boolean) => {
    startTransition(async () => {
      const result = await generateInvoicesAction({
        structureId,
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

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <FileStack className="size-4" aria-hidden />
        Generate invoices
      </Button>

      {open ? (
        <div
          className="fixed inset-0 z-60 grid place-items-center p-4 bg-black/45"
          role="dialog"
          aria-modal="true"
          aria-label="Generate invoices"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto scroll-thin bg-surface border border-line rounded-[var(--radius)] shadow-2xl p-5">
            <h2 className="text-[15px] font-semibold text-ink">Generate invoices</h2>
            <p className="text-[13px] text-ink-muted mt-0.5">
              Concessions are applied automatically. Students already billed for this title are
              skipped.
            </p>

            <div className="grid gap-4 sm:grid-cols-2 mt-4">
              <Field label="Fee structure" htmlFor="gen-structure" required className="sm:col-span-2">
                <Select
                  id="gen-structure"
                  value={structureId}
                  onChange={(e) => {
                    setStructureId(e.target.value)
                    setPreview(null)
                  }}
                >
                  {structures.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} — {s.className} — {formatMoney(s.totalMinor, currency)}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                label="Invoice title"
                htmlFor="gen-title"
                required
                hint="Shown to parents, e.g. Term 2 — 2025-26"
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

              <Field label="Class" htmlFor="gen-class" hint="Leave blank for the whole school">
                <Select
                  id="gen-class"
                  value={classLevelId}
                  onChange={(e) => {
                    setClassLevelId(e.target.value)
                    setSectionId('')
                    setPreview(null)
                  }}
                >
                  <option value="">All classes in the structure</option>
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
                  <p className="text-[13px] text-ink">
                    <span className="font-medium">{willBill.length}</span> to bill
                    {preview.skipped > 0 ? (
                      <span className="text-ink-muted"> · {preview.skipped} already invoiced</span>
                    ) : null}
                  </p>
                  <p className="text-[13.5px] font-semibold tnum text-ink">
                    {formatMoney(preview.totalMinor, currency)}
                  </p>
                </div>

                <ul className="max-h-56 overflow-y-auto scroll-thin divide-y divide-[var(--border)]">
                  {preview.preview.slice(0, 60).map((p) => (
                    <li
                      key={p.studentId}
                      className="flex items-center justify-between gap-3 px-3.5 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-[13px] text-ink truncate">{p.studentName}</p>
                        <p className="text-[11.5px] text-ink-subtle tnum">{p.admissionNo}</p>
                      </div>
                      {p.skipReason ? (
                        <span className="text-[12px] text-ink-subtle shrink-0">{p.skipReason}</span>
                      ) : (
                        <span className="text-[12.5px] tnum text-ink shrink-0">
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
                {preview.preview.length > 60 ? (
                  <p className="px-3.5 py-2 text-[12px] text-ink-subtle border-t border-line">
                    Showing the first 60 of {preview.preview.length}.
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 mt-5">
              {!preview ? (
                <Button onClick={() => run(true)} loading={pending} disabled={!title.trim()}>
                  {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                  Preview
                </Button>
              ) : (
                <>
                  <Button
                    onClick={() => run(false)}
                    loading={pending}
                    disabled={willBill.length === 0}
                  >
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
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
