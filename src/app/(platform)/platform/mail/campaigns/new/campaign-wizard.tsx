'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Download,
  Eye,
  FileSpreadsheet,
  FlaskConical,
  Rocket,
  Search,
  UploadCloud,
  X,
} from 'lucide-react'
import {
  BULK_VAR_HINT,
  MAX_CAMPAIGN_RECIPIENTS,
  detectColumns,
  parseCsv,
  rowsToRecipients,
  type BulkRecipient,
  type ColumnMap,
} from '@/lib/bulk-mail'
import { MAIL_TEMPLATES, formatBytes, type MailLayout } from '@/lib/platform-mail'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox, Field, Input, Select } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'
import { cn } from '@/lib/utils'
import { RichEditor } from '../../compose/rich-editor'
import { checkRecipientsAction, createCampaignAction, previewCampaignAction, sendCampaignTestAction } from '../actions'

type Mailbox = { id: string; fromName: string; fromEmail: string; isDefault: boolean; verifiedAt: Date | null }
type Doc = { id: string; title: string; sizeBytes: number }

type Check = {
  unsubscribed: Set<string>
  crm: Record<string, { id: string; name: string }>
  mailedBefore: Record<string, number>
}

const STEPS = ['Recipients', 'Message', 'Review & create'] as const

const MAP_FIELDS: { key: keyof ColumnMap; label: string; required?: boolean }[] = [
  { key: 'email', label: 'Email', required: true },
  { key: 'altEmail', label: 'Alternate email' },
  { key: 'schoolName', label: 'School name' },
  { key: 'contactName', label: 'Contact name' },
  { key: 'area', label: 'Area' },
]

const SAMPLE_CSV =
  'School,Contact name,Area,Email,Alternate email\n' +
  '"Example Public School","Mrs. Sharma (Principal)","Saket","principal@example-school.in","office@example-school.in"\n'

const intro = MAIL_TEMPLATES.find((t) => t.key === 'personal-intro') ?? MAIL_TEMPLATES[0]!

const STYLE_LABELS: Record<MailLayout, { title: string; hint: string }> = {
  PLAIN: {
    title: 'Personal — best chance of Gmail’s Primary tab',
    hint: 'Reads like a one-to-one email: no logo, no button, opt-out as a short P.S.',
  },
  BRANDED: {
    title: 'Branded — logo header and footer',
    hint: 'Looks like a newsletter; Gmail usually files it under Promotions.',
  },
}

export function CampaignWizard({ mailboxes, documents }: { mailboxes: Mailbox[]; documents: Doc[] }) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState(0)

  // Step 1 — the list
  const [fileName, setFileName] = useState<string | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [map, setMap] = useState<ColumnMap | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [check, setCheck] = useState<Check | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [query, setQuery] = useState('')

  // Step 2 — the message
  const defaultBox = mailboxes.find((m) => m.isDefault) ?? mailboxes[0]
  const [name, setName] = useState('')
  const [mailboxId, setMailboxId] = useState(defaultBox?.id ?? '')
  const [subject, setSubject] = useState(intro.subject)
  const [body, setBody] = useState(intro.bodyHtml)
  const [templateKey, setTemplateKey] = useState(intro.key)
  const [layout, setLayout] = useState<MailLayout>('PLAIN')
  const [demoButton, setDemoButton] = useState(intro.demoButton)
  const [includeSignature, setIncludeSignature] = useState(true)
  const [documentIds, setDocumentIds] = useState<string[]>([])

  // Step 3 — review
  const [sampleIndex, setSampleIndex] = useState(0)
  const [preview, setPreview] = useState<{ html?: string; error?: string; loading: boolean }>({ loading: false })
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState<'test' | 'create' | null>(null)

  const parsed = useMemo(() => (map ? rowsToRecipients(rows, map) : []), [rows, map])
  const emailsKey = useMemo(() => parsed.filter((p) => !p.problem).map((p) => p.email).join('|'), [parsed])

  useEffect(() => {
    if (!emailsKey) {
      setCheck(null)
      return
    }
    let live = true
    checkRecipientsAction(emailsKey.split('|')).then((r) => {
      if (!live || !r.ok) return
      const next: Check = { unsubscribed: new Set(r.unsubscribed), crm: r.crm, mailedBefore: r.mailedBefore }
      setCheck(next)
      setSelected(new Set(parsed.filter((p) => !p.problem && !next.unsubscribed.has(p.email)).map((p) => p.row)))
    })
    return () => {
      live = false
    }
    // Re-run only when the set of usable addresses changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailsKey])

  function loadFile(file: File) {
    setFileError(null)
    if (!/\.csv$/i.test(file.name) && file.type !== 'text/csv') {
      setFileError('Choose a .csv file. In Excel or Google Sheets use File → Save as / Download → CSV.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setFileError('That file is larger than 2 MB. Split the list into smaller files.')
      return
    }
    file.text().then((text) => {
      const all = parseCsv(text)
      if (all.length < 2) {
        setFileError('The file needs a header row and at least one school.')
        return
      }
      const [head, ...data] = all
      const detected = detectColumns(head!, data.slice(0, 20))
      if (detected.email < 0) {
        setFileError('No column with email addresses was found. Add an “Email” column and upload again.')
        return
      }
      if (data.length > MAX_CAMPAIGN_RECIPIENTS) {
        setFileError(`The file has ${data.length} rows; one campaign takes up to ${MAX_CAMPAIGN_RECIPIENTS}. Split it into smaller files.`)
        return
      }
      setFileName(file.name)
      setHeaders(head!)
      setRows(data)
      setMap(detected)
      setQuery('')
      if (!name) {
        const base = file.name.replace(/\.csv$/i, '').replace(/[-_]+/g, ' ').trim()
        const when = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
        setName(`${base.charAt(0).toUpperCase()}${base.slice(1)} — ${when}`)
      }
    })
  }

  function clearFile() {
    setFileName(null)
    setHeaders([])
    setRows([])
    setMap(null)
    setCheck(null)
    setSelected(new Set())
  }

  function downloadSample() {
    const url = URL.createObjectURL(new Blob([SAMPLE_CSV], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'bulk-email-sample.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  function applyTemplate(key: string) {
    const t = MAIL_TEMPLATES.find((x) => x.key === key)
    setTemplateKey(key)
    if (!t) return
    setSubject(t.subject)
    setBody(t.bodyHtml)
    setDemoButton(t.demoButton)
  }

  const ready = parsed.filter((p) => !p.problem)
  const counts = {
    total: parsed.length,
    ready: ready.filter((p) => !check?.unsubscribed.has(p.email)).length,
    invalid: parsed.filter((p) => p.problem === 'Invalid email' || p.problem === 'No email').length,
    duplicate: parsed.filter((p) => p.problem === 'Duplicate').length,
    unsubscribed: ready.filter((p) => check?.unsubscribed.has(p.email)).length,
    crm: ready.filter((p) => check?.crm[p.email]).length,
    mailed: ready.filter((p) => check?.mailedBefore[p.email]).length,
  }
  const chosen = parsed.filter((p) => selected.has(p.row) && !p.problem && !check?.unsubscribed.has(p.email))
  const recipients: BulkRecipient[] = chosen.map(({ email, schoolName, contactName, area }) => ({ email, schoolName, contactName, area }))
  const visible = query.trim()
    ? parsed.filter((p) =>
        [p.email, p.schoolName, p.contactName, p.area].some((v) => v?.toLowerCase().includes(query.trim().toLowerCase())),
      )
    : parsed

  const payload = {
    name,
    mailboxId,
    subject,
    bodyHtml: body,
    layout,
    demoButton,
    includeSignature,
    documentIds,
    sourceFileName: fileName,
    recipients,
  }
  const sample = recipients[Math.min(sampleIndex, Math.max(0, recipients.length - 1))] ?? {}

  useEffect(() => {
    if (step !== 2) return
    setPreview((p) => ({ ...p, loading: true }))
    let live = true
    previewCampaignAction(payload, sample).then((r) => {
      if (live) setPreview({ loading: false, ...r })
    })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, sampleIndex, mailboxId])

  function sendTest() {
    setNotice(null)
    setBusy('test')
    startTransition(async () => {
      const r = await sendCampaignTestAction(payload, sample)
      setNotice({ tone: r.ok ? 'success' : 'danger', text: r.message })
      setBusy(null)
    })
  }

  function create() {
    setNotice(null)
    setBusy('create')
    startTransition(async () => {
      const r = await createCampaignAction(payload)
      if (r.id) {
        router.push(`/platform/mail/campaigns/${r.id}?created=1`)
        return
      }
      setNotice({ tone: 'danger', text: r.error ?? 'Could not create the campaign' })
      setBusy(null)
    })
  }

  if (mailboxes.length === 0) {
    return (
      <Notice tone="warning" title="Connect your mailbox first">
        Bulk emails go out from your own address. Ask the Super Admin to connect it under{' '}
        <Link href="/platform/mail/settings" className="font-medium underline">
          Mail → Mailbox
        </Link>
        .
      </Notice>
    )
  }

  const canContinue = step === 0 ? recipients.length > 0 : step === 1 ? !!(name.trim() && subject.trim() && mailboxId) : true

  return (
    <div className="space-y-5">
      <ol className="grid gap-2 sm:grid-cols-3" aria-label="Steps">
        {STEPS.map((label, i) => (
          <li key={label}>
            <button
              type="button"
              disabled={i > step && !canContinue}
              onClick={() => (i < step || (i === step + 1 && canContinue) ? setStep(i) : undefined)}
              className={cn(
                'flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors',
                i === step ? 'border-[#7c3aed] bg-[color-mix(in_srgb,#7c3aed_7%,transparent)]' : 'border-line bg-surface',
                i < step && 'hover:border-line-strong',
              )}
              aria-current={i === step ? 'step' : undefined}
            >
              <span
                className={cn(
                  'grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold',
                  i < step ? 'bg-success text-white' : i === step ? 'bg-[#7c3aed] text-white' : 'bg-surface-2 text-ink-muted',
                )}
              >
                {i < step ? <Check className="size-4" aria-hidden /> : i + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ink">{label}</span>
                <span className="block truncate text-xs text-ink-subtle">
                  {i === 0
                    ? recipients.length
                      ? `${recipients.length} school${recipients.length === 1 ? '' : 's'} selected`
                      : 'Upload a CSV'
                    : i === 1
                      ? subject || 'Write once, personalised for each school'
                      : 'Preview, test and create'}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <div className="space-y-4">
          {!fileName ? (
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragging(false)
                const f = e.dataTransfer.files[0]
                if (f) loadFile(f)
              }}
              className={cn(
                'flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-colors',
                dragging ? 'border-[#7c3aed] bg-[color-mix(in_srgb,#7c3aed_6%,transparent)]' : 'border-line-strong bg-surface',
              )}
            >
              <span className="grid size-14 place-items-center rounded-2xl bg-[color-mix(in_srgb,#7c3aed_12%,transparent)] text-[#7c3aed]">
                <UploadCloud className="size-7" aria-hidden />
              </span>
              <h2 className="mt-4 text-base font-semibold text-ink">Drop your CSV of schools here</h2>
              <p className="mt-1 max-w-md text-sm text-ink-muted">
                The email, school name, contact name and area columns are recognised automatically. Up to{' '}
                {MAX_CAMPAIGN_RECIPIENTS} schools per file.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <Button type="button" onClick={() => fileRef.current?.click()}>
                  <FileSpreadsheet aria-hidden /> Choose CSV file
                </Button>
                <Button type="button" variant="secondary" onClick={downloadSample}>
                  <Download aria-hidden /> Sample CSV
                </Button>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) loadFile(f)
                  e.target.value = ''
                }}
              />
              {fileError ? (
                <p className="mt-4 text-sm text-[var(--danger)]" role="alert">
                  {fileError}
                </p>
              ) : null}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
                <span className="grid size-10 place-items-center rounded-lg bg-[color-mix(in_srgb,#10b981_14%,transparent)] text-[#10b981]">
                  <FileSpreadsheet className="size-5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{fileName}</p>
                  <p className="text-xs text-ink-subtle">
                    {counts.total} row{counts.total === 1 ? '' : 's'} · {headers.length} columns
                  </p>
                </div>
                <Button type="button" size="sm" variant="ghost" onClick={clearFile}>
                  <X aria-hidden /> Use another file
                </Button>
              </div>

              <section className="rounded-xl border border-line bg-surface p-4">
                <h2 className="text-sm font-semibold text-ink">Columns</h2>
                <p className="mt-0.5 text-xs text-ink-subtle">Picked up from your headers. Change any that look wrong.</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {MAP_FIELDS.map((f) => (
                    <Field key={f.key} label={f.label} required={f.required} htmlFor={`map-${f.key}`}>
                      <Select
                        id={`map-${f.key}`}
                        value={map?.[f.key] ?? -1}
                        onChange={(e) => setMap((m) => (m ? { ...m, [f.key]: Number(e.target.value) } : m))}
                      >
                        <option value={-1}>— Not in file —</option>
                        {headers.map((h, i) => (
                          <option key={i} value={i}>
                            {h || `Column ${i + 1}`}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  ))}
                </div>
              </section>

              <div className="flex flex-wrap gap-2 text-xs">
                <Chip tone="success">{counts.ready} ready to email</Chip>
                {counts.invalid ? <Chip tone="danger">{counts.invalid} without a valid email</Chip> : null}
                {counts.duplicate ? <Chip tone="neutral">{counts.duplicate} duplicate{counts.duplicate === 1 ? '' : 's'} removed</Chip> : null}
                {counts.unsubscribed ? <Chip tone="danger">{counts.unsubscribed} unsubscribed — will be skipped</Chip> : null}
                {counts.crm ? <Chip tone="info">{counts.crm} already in Growth CRM — logged on their timeline</Chip> : null}
                {counts.mailed ? <Chip tone="warning">{counts.mailed} emailed in an earlier campaign</Chip> : null}
              </div>

              <section className="overflow-hidden rounded-xl border border-line bg-surface">
                <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
                  <div className="relative min-w-56 flex-1">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
                    <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search school, contact, area or email" className="pl-8" aria-label="Search the list" />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => setSelected(new Set(ready.filter((p) => !check?.unsubscribed.has(p.email)).map((p) => p.row)))}
                  >
                    Select all ready
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                    Clear
                  </Button>
                  <span className="ml-auto text-sm font-medium text-ink">
                    {recipients.length} selected
                  </span>
                </div>
                <div className="max-h-[460px] overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-surface-2 text-left text-xs uppercase tracking-wide text-ink-subtle">
                      <tr>
                        <th className="w-10 px-3 py-2" />
                        <th className="w-12 px-2 py-2 font-medium">Row</th>
                        <th className="px-2 py-2 font-medium">School</th>
                        <th className="px-2 py-2 font-medium">Contact</th>
                        <th className="px-2 py-2 font-medium">Area</th>
                        <th className="px-2 py-2 font-medium">Email</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {visible.map((p) => {
                        const unsub = !p.problem && check?.unsubscribed.has(p.email)
                        const blocked = !!p.problem || !!unsub
                        const crm = !p.problem ? check?.crm[p.email] : undefined
                        const mailed = !p.problem ? check?.mailedBefore[p.email] : undefined
                        return (
                          <tr key={p.row} className={cn(blocked ? 'bg-surface-2/50 text-ink-subtle' : 'hover:bg-surface-2/60')}>
                            <td className="px-3 py-2">
                              <Checkbox
                                aria-label={`Include ${p.schoolName ?? p.email}`}
                                disabled={blocked}
                                checked={!blocked && selected.has(p.row)}
                                onChange={(e) =>
                                  setSelected((s) => {
                                    const next = new Set(s)
                                    if (e.target.checked) next.add(p.row)
                                    else next.delete(p.row)
                                    return next
                                  })
                                }
                              />
                            </td>
                            <td className="px-2 py-2 text-xs text-ink-subtle tnum">{p.row}</td>
                            <td className="max-w-64 truncate px-2 py-2 font-medium text-ink">{p.schoolName ?? '—'}</td>
                            <td className="max-w-48 truncate px-2 py-2 text-ink-muted">{p.contactName ?? '—'}</td>
                            <td className="max-w-40 truncate px-2 py-2 text-ink-muted">{p.area ?? '—'}</td>
                            <td className="max-w-64 truncate px-2 py-2 text-ink-muted">{p.email || '—'}</td>
                            <td className="whitespace-nowrap px-3 py-2">
                              {p.problem ? (
                                <Badge tone={p.problem === 'Duplicate' ? 'neutral' : 'danger'}>{p.problem}</Badge>
                              ) : unsub ? (
                                <Badge tone="danger">Unsubscribed</Badge>
                              ) : (
                                <span className="flex gap-1">
                                  <Badge tone="success">Ready</Badge>
                                  {crm ? <Badge tone="info" title={crm.name}>In CRM</Badge> : null}
                                  {mailed ? <Badge tone="warning">Emailed ×{mailed}</Badge> : null}
                                </span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  {visible.length === 0 ? <p className="py-10 text-center text-sm text-ink-muted">No rows match “{query}”.</p> : null}
                </div>
              </section>
            </>
          )}
        </div>
      ) : null}

      {step === 1 ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Campaign name" htmlFor="c-name" required hint="Only your team sees this.">
                <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="South Delhi schools — October" />
              </Field>
              <Field label="Send from" htmlFor="c-box" required>
                <Select id="c-box" value={mailboxId} onChange={(e) => setMailboxId(e.target.value)}>
                  {mailboxes.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.fromName} &lt;{m.fromEmail}&gt;{m.verifiedAt ? '' : ' — not tested'}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Subject" htmlFor="c-subject" required>
              <Input id="c-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} className="font-medium" />
            </Field>
            <RichEditor value={body} onChange={setBody} placeholder="Write the message every school will receive…" />
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-subtle">
              <span>Personalise with:</span>
              {['{{schoolName}}', '{{contactName}}', '{{area}}', '{{senderName}}'].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(v)}
                  className="rounded-full border border-line bg-surface px-2 py-0.5 font-mono text-[11px] text-ink-muted hover:border-line-strong hover:text-ink"
                  title="Copy, then paste into the subject or message"
                >
                  {v}
                </button>
              ))}
            </div>
            <p className="text-xs text-ink-subtle">
              {BULK_VAR_HINT} A blank cell becomes “Sir / Madam” or “your school”. Every email gets an opt-out link — a short P.S. in the
              Personal style, a footer line in the Branded one. For the Primary tab keep it short, skip bullet lists and
              attachments, and end with a question so schools reply.
            </p>
          </div>

          <aside className="space-y-4">
            <Panel title="Template">
              <Select aria-label="Template" value={templateKey} onChange={(e) => applyTemplate(e.target.value)}>
                <option value="">Blank</option>
                {MAIL_TEMPLATES.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Panel>
            <Panel title="Style">
              <div className="space-y-2">
                {(['PLAIN', 'BRANDED'] as MailLayout[]).map((l) => (
                  <label key={l} className="flex cursor-pointer items-start gap-2 text-sm text-ink">
                    <input
                      type="radio"
                      name="layout"
                      className="mt-1 accent-[var(--brand-500)]"
                      checked={layout === l}
                      onChange={() => {
                        setLayout(l)
                        if (l === 'PLAIN') setDemoButton(false)
                      }}
                    />
                    <span>
                      <span className="block">{STYLE_LABELS[l].title}</span>
                      <span className="block text-xs text-ink-subtle">{STYLE_LABELS[l].hint}</span>
                    </span>
                  </label>
                ))}
                <div className="space-y-2 border-t border-line pt-2">
                  <label className="flex items-center gap-2 text-sm text-ink">
                    <Checkbox checked={includeSignature} onChange={(e) => setIncludeSignature(e.target.checked)} />
                    Add my signature
                  </label>
                  <label className="flex items-center gap-2 text-sm text-ink">
                    <Checkbox checked={demoButton} onChange={(e) => setDemoButton(e.target.checked)} />
                    “Schedule a live demo” button
                  </label>
                </div>
              </div>
            </Panel>
            <Panel title="Attach from the library" hint={documents.length ? 'Up to 5. Keep attachments small — large files hurt delivery.' : 'Upload a brochure in Mail → Library to attach it here.'}>
              {documents.length ? (
                <ul className="max-h-56 space-y-1 overflow-y-auto">
                  {documents.map((d) => (
                    <li key={d.id}>
                      <label className="flex cursor-pointer items-start gap-2 rounded-[var(--radius-sm)] px-1.5 py-1 text-sm hover:bg-surface-2">
                        <Checkbox
                          className="mt-0.5"
                          checked={documentIds.includes(d.id)}
                          disabled={!documentIds.includes(d.id) && documentIds.length >= 5}
                          onChange={(e) => setDocumentIds((ids) => (e.target.checked ? [...ids, d.id] : ids.filter((x) => x !== d.id)))}
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-ink">{d.title}</span>
                          <span className="block text-xs text-ink-subtle">{formatBytes(d.sizeBytes)}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              ) : null}
            </Panel>
          </aside>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <section className="min-w-0 overflow-hidden rounded-xl border border-line bg-surface">
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
              <Eye className="size-4 text-ink-subtle" aria-hidden />
              <span className="text-sm font-medium text-ink">Preview as</span>
              <Select aria-label="Preview as school" value={sampleIndex} onChange={(e) => setSampleIndex(Number(e.target.value))} className="h-8 max-w-sm flex-1 text-sm">
                {recipients.slice(0, 200).map((r, i) => (
                  <option key={r.email} value={i}>
                    {r.schoolName ?? r.email} — {r.email}
                  </option>
                ))}
              </Select>
            </div>
            {preview.loading ? (
              <p className="py-24 text-center text-sm text-ink-muted">Building preview…</p>
            ) : preview.error ? (
              <div className="p-4">
                <Notice tone="danger">{preview.error}</Notice>
              </div>
            ) : (
              <iframe title="Email preview" sandbox="" srcDoc={preview.html} className="h-[70vh] w-full bg-white" />
            )}
          </section>

          <aside className="space-y-4">
            <Panel title="Summary">
              <dl className="space-y-2 text-sm">
                <Row label="Campaign" value={name} />
                <Row label="Schools" value={`${recipients.length}`} />
                <Row label="From" value={mailboxes.find((m) => m.id === mailboxId)?.fromEmail ?? '—'} />
                <Row label="Subject" value={subject} />
                <Row label="Attachments" value={documentIds.length ? `${documentIds.length}` : 'None'} />
                <Row label="List" value={fileName ?? '—'} />
              </dl>
            </Panel>
            <Notice tone="info" title="How sending works">
              Creating the campaign sends nothing yet. On the next screen you send it in batches — 10 schools at a time by
              default — with a short pause between each email so school mail servers accept them.
            </Notice>
            {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
            <div className="flex flex-col gap-2">
              <Button type="button" onClick={create} loading={pending && busy === 'create'} disabled={pending || !recipients.length}>
                <Rocket aria-hidden /> Create campaign for {recipients.length} school{recipients.length === 1 ? '' : 's'}
              </Button>
              <Button type="button" variant="secondary" onClick={sendTest} loading={pending && busy === 'test'} disabled={pending}>
                <FlaskConical aria-hidden /> Send test to me
              </Button>
            </div>
          </aside>
        </div>
      ) : null}

      <div className="flex items-center justify-between border-t border-line pt-4">
        {step > 0 ? (
          <Button type="button" variant="secondary" onClick={() => setStep((s) => s - 1)}>
            <ArrowLeft aria-hidden /> Back
          </Button>
        ) : (
          <Link href="/platform/mail/campaigns" className="text-sm text-ink-muted hover:text-ink">
            Cancel
          </Link>
        )}
        {step < 2 ? (
          <Button type="button" onClick={() => setStep((s) => s + 1)} disabled={!canContinue}>
            {step === 0 ? `Continue with ${recipients.length} school${recipients.length === 1 ? '' : 's'}` : 'Review'}
            <ArrowRight aria-hidden />
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function Chip({ tone, children }: { tone: 'success' | 'danger' | 'neutral' | 'info' | 'warning'; children: React.ReactNode }) {
  return (
    <Badge tone={tone} className="px-2 py-0.5 text-xs">
      {children}
    </Badge>
  )
}

function Panel({ title, hint, children }: { title: string; hint?: string; children?: React.ReactNode }) {
  return (
    <section className="space-y-2 rounded-[var(--radius-md,10px)] border border-line bg-surface p-3">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      {children}
      {hint ? <p className="text-xs text-ink-subtle">{hint}</p> : null}
    </section>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-24 shrink-0 text-ink-subtle">{label}</dt>
      <dd className="min-w-0 break-words text-ink">{value}</dd>
    </div>
  )
}
