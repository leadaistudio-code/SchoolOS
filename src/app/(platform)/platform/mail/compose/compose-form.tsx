'use client'

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { CornerUpLeft, Eye, FileText, FlaskConical, Paperclip, Plus, Send, X } from 'lucide-react'
import { previewMailAction, sendMailAction } from '../actions'
import { emptyFormState } from '@/lib/form-state'
import {
  MAIL_LAYOUT_LABELS,
  MAIL_TEMPLATES,
  MAIL_TEMPLATE_VAR_HINT,
  MAX_ATTACHMENT_TOTAL_MB,
  fillMailTemplate,
  formatBytes,
  parseAddressList,
  unresolvedPlaceholders,
  type MailLayout,
  type MailTemplateVars,
} from '@/lib/platform-mail'
import { Button } from '@/components/ui/button'
import { Checkbox, Field, Input, Select } from '@/components/ui/input'
import { Dialog } from '@/components/ui/dialog'
import { Notice } from '@/components/ui/states'
import { cn } from '@/lib/utils'
import { RichEditor } from './rich-editor'

export type ComposeMailbox = {
  id: string
  fromName: string
  fromEmail: string
  isDefault: boolean
  signatureName: string | null
  signatureTitle: string | null
  verifiedAt: Date | null
}

export type ComposeSchool = {
  id: string
  name: string
  email: string | null
  contacts: { id: string; fullName: string; designation: string | null; email: string | null }[]
}

export type ComposeDocument = { id: string; title: string; fileName: string; sizeBytes: number }

export type ComposeTemplate = {
  key: string
  name: string
  group: string
  subject: string
  bodyHtml: string
  demoButton: boolean
}

export type ComposeInitial = {
  mailboxId?: string
  schoolId?: string
  contactId?: string
  to?: string
  cc?: string
  bcc?: string
  subject?: string
  bodyHtml?: string
  layout?: MailLayout
  demoButton?: boolean
  documentIds?: string[]
  templateKey?: string
  inReplyTo?: string
  references?: string
  origin?: { mailboxId: string; folder: string; uid: number }
  forwardAttachments?: { index: number; filename: string; size: number }[]
  replyLabel?: string
}

const ACCEPT = '.pdf,.docx,.xlsx,.png,.jpg,.jpeg,.webp,.csv,.txt'

function addAddress(list: string, address: string): string {
  const current = parseAddressList(list).valid
  if (current.includes(address.toLowerCase())) return list
  return [...current, address].join(', ')
}

export function ComposeForm({
  mailboxes,
  schools,
  documents,
  crmTemplates,
  initial,
}: {
  mailboxes: ComposeMailbox[]
  schools: ComposeSchool[]
  documents: ComposeDocument[]
  crmTemplates: ComposeTemplate[]
  initial: ComposeInitial
}) {
  const [state, formAction, sending] = useActionState(sendMailAction, emptyFormState)
  const [, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const defaultBox = mailboxes.find((m) => m.id === initial.mailboxId) ?? mailboxes.find((m) => m.isDefault) ?? mailboxes[0]
  const [mailboxId, setMailboxId] = useState(defaultBox?.id ?? '')
  const [schoolId, setSchoolId] = useState(initial.schoolId ?? '')
  const [contactId, setContactId] = useState(initial.contactId ?? '')
  const [to, setTo] = useState(initial.to ?? '')
  const [cc, setCc] = useState(initial.cc ?? '')
  const [bcc, setBcc] = useState(initial.bcc ?? '')
  const [showCc, setShowCc] = useState(!!(initial.cc || initial.bcc))
  const [subject, setSubject] = useState(initial.subject ?? '')
  const [body, setBody] = useState(initial.bodyHtml ?? '')
  const [layout, setLayout] = useState<MailLayout>(initial.layout ?? 'BRANDED')
  const [demoButton, setDemoButton] = useState(initial.demoButton ?? false)
  const [includeSignature, setIncludeSignature] = useState(true)
  const [templateKey, setTemplateKey] = useState('')
  const [documentIds, setDocumentIds] = useState<string[]>(initial.documentIds ?? [])
  const [files, setFiles] = useState<File[]>([])
  const forwardable = initial.forwardAttachments ?? []
  const [forwardParts, setForwardParts] = useState<number[]>(forwardable.map((a) => a.index))
  const [intent, setIntent] = useState<'send' | 'test'>('send')
  const [dirty, setDirty] = useState(false)
  const [preview, setPreview] = useState<{ open: boolean; html?: string; error?: string; loading: boolean }>({
    open: false,
    loading: false,
  })

  const box = mailboxes.find((m) => m.id === mailboxId)
  const school = schools.find((s) => s.id === schoolId)
  const contact = school?.contacts.find((c) => c.id === contactId)

  const vars: Partial<MailTemplateVars> = useMemo(
    () => ({
      contactName: contact?.fullName || (school ? 'Sir / Madam' : undefined),
      schoolName: school?.name,
      senderName: box?.signatureName || box?.fromName,
      senderTitle: box?.signatureTitle || undefined,
    }),
    [contact, school, box],
  )

  // Placeholders left by a template fill in as soon as the school, contact or
  // sender that supplies them is chosen.
  useEffect(() => {
    setSubject((s) => fillMailTemplate(s, vars))
    setBody((b) => fillMailTemplate(b, vars))
  }, [vars])

  useEffect(() => {
    if (initial.templateKey) applyTemplate(initial.templateKey)
    // Applied once, on arrival from a CRM "Email" shortcut.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const templates: ComposeTemplate[] = useMemo(
    () => [...MAIL_TEMPLATES.map((t) => ({ ...t, group: 'MyCampusView' })), ...crmTemplates],
    [crmTemplates],
  )

  function applyTemplate(key: string) {
    setTemplateKey(key)
    const t = templates.find((x) => x.key === key)
    if (!t) return
    if (dirty && body.trim() && !window.confirm('Replace the current message with this template?')) {
      setTemplateKey('')
      return
    }
    setSubject(fillMailTemplate(t.subject, vars))
    setBody(fillMailTemplate(t.bodyHtml, vars))
    setDemoButton(t.demoButton)
    setDirty(true)
  }

  function chooseSchool(id: string) {
    setSchoolId(id)
    setContactId('')
    const next = schools.find((s) => s.id === id)
    if (!next) return
    const primary = next.contacts.find((c) => c.email)
    const address = primary?.email || next.email
    if (primary) setContactId(primary.id)
    if (address && !to.trim()) setTo(address)
  }

  const toCheck = parseAddressList(to)
  const ccCheck = parseAddressList(cc)
  const bccCheck = parseAddressList(bcc)
  const invalidAddresses = [...toCheck.invalid, ...ccCheck.invalid, ...bccCheck.invalid]
  const missing = unresolvedPlaceholders(`${subject} ${body}`)

  const selectedDocs = documents.filter((d) => documentIds.includes(d.id))
  const forwarded = forwardable.filter((a) => forwardParts.includes(a.index))
  const totalBytes =
    files.reduce((s, f) => s + f.size, 0) +
    selectedDocs.reduce((s, d) => s + d.sizeBytes, 0) +
    forwarded.reduce((s, a) => s + a.size, 0)
  const overLimit = totalBytes > MAX_ATTACHMENT_TOTAL_MB * 1024 * 1024

  function buildFormData(kind: 'send' | 'test' | 'preview') {
    const fd = new FormData()
    fd.set('intent', kind)
    fd.set('mailboxId', mailboxId)
    fd.set('to', to)
    fd.set('cc', showCc ? cc : '')
    fd.set('bcc', showCc ? bcc : '')
    fd.set('subject', subject)
    fd.set('bodyHtml', body)
    fd.set('layout', layout)
    if (demoButton) fd.set('demoButton', 'on')
    if (includeSignature) fd.set('includeSignature', 'on')
    if (schoolId) fd.set('crmSchoolId', schoolId)
    for (const id of documentIds) fd.append('documentId', id)
    if (kind !== 'preview') for (const f of files) fd.append('files', f)
    if (initial.inReplyTo) fd.set('inReplyTo', initial.inReplyTo)
    if (initial.references) fd.set('references', initial.references)
    if (initial.origin) {
      fd.set('originMailboxId', initial.origin.mailboxId)
      fd.set('originFolder', initial.origin.folder)
      fd.set('originUid', String(initial.origin.uid))
      if (kind !== 'preview') for (const i of forwardParts) fd.append('forwardPart', String(i))
    }
    return fd
  }

  function submit(kind: 'send' | 'test') {
    setIntent(kind)
    if (kind === 'send') setDirty(false)
    startTransition(() => formAction(buildFormData(kind)))
  }

  async function openPreview() {
    setPreview({ open: true, loading: true })
    const result = await previewMailAction(buildFormData('preview'))
    setPreview({ open: true, loading: false, ...result })
  }

  if (mailboxes.length === 0) {
    return (
      <Notice tone="warning" title="Connect your mailbox first">
        Emails are sent from your own address. Ask the Super Admin to connect the Hostinger mailbox under{' '}
        <Link href="/platform/mail/settings" className="font-medium underline">
          Mail → Mailbox
        </Link>
        .
      </Notice>
    )
  }

  const recipientSuggestions = school
    ? [
        ...school.contacts
          .filter((c) => c.email)
          .map((c) => ({ label: `${c.fullName}${c.designation ? ` · ${c.designation}` : ''}`, email: c.email! })),
        ...(school.email ? [{ label: 'School office', email: school.email }] : []),
      ]
    : []

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault()
        submit('send')
      }}
      onInput={() => setDirty(true)}
      className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]"
    >
      <div className="min-w-0 space-y-4">
        {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
        {state.ok ? <Notice tone="success">{state.message}</Notice> : null}
        {initial.replyLabel ? (
          <p className="flex items-center gap-1.5 text-sm text-ink-muted">
            <CornerUpLeft className="size-4" aria-hidden /> {initial.replyLabel}
            {initial.inReplyTo ? ' · your answer will appear in the same conversation' : ''}
          </p>
        ) : null}

        <div className="overflow-hidden rounded-[var(--radius-md,10px)] border border-line bg-surface">
          <Row label="From">
            <Select
              aria-label="Send from"
              value={mailboxId}
              onChange={(e) => setMailboxId(e.target.value)}
              className="border-0 bg-transparent px-0 shadow-none focus:border-0"
            >
              {mailboxes.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.fromName} &lt;{m.fromEmail}&gt;{m.verifiedAt ? '' : ' — not tested'}
                </option>
              ))}
            </Select>
          </Row>
          <Row label="To" action={!showCc ? <button type="button" className="text-xs font-medium text-ink-muted hover:text-ink" onClick={() => setShowCc(true)}>Cc / Bcc</button> : null}>
            <Input
              aria-label="To"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="principal@school.edu.in, office@school.edu.in"
              className="border-0 bg-transparent px-0"
              aria-invalid={toCheck.invalid.length > 0}
            />
          </Row>
          {showCc ? (
            <>
              <Row label="Cc">
                <Input aria-label="Cc" value={cc} onChange={(e) => setCc(e.target.value)} className="border-0 bg-transparent px-0" />
              </Row>
              <Row label="Bcc">
                <Input aria-label="Bcc" value={bcc} onChange={(e) => setBcc(e.target.value)} className="border-0 bg-transparent px-0" />
              </Row>
            </>
          ) : null}
          <Row label="Subject" last>
            <Input
              aria-label="Subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={200}
              placeholder="Proposal for … — MyCampusView School ERP"
              className="border-0 bg-transparent px-0 font-medium"
            />
          </Row>
        </div>

        {recipientSuggestions.length ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-ink-subtle">Add from {school!.name}:</span>
            {recipientSuggestions.map((s) => (
              <button
                key={s.email}
                type="button"
                onClick={() => setTo((v) => addAddress(v, s.email))}
                className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-0.5 text-xs text-ink-muted hover:border-line-strong hover:text-ink"
              >
                <Plus className="size-3" aria-hidden />
                {s.label} <span className="text-ink-subtle">{s.email}</span>
              </button>
            ))}
          </div>
        ) : null}

        {invalidAddresses.length ? (
          <p className="text-xs text-[var(--danger)]" role="alert">
            Check these addresses: {invalidAddresses.join(', ')}
          </p>
        ) : null}

        <RichEditor
          value={body}
          onChange={(html) => {
            setBody(html)
            setDirty(true)
          }}
          placeholder="Write your message, or choose a template on the right…"
        />
        <p className="text-xs text-ink-subtle">{MAIL_TEMPLATE_VAR_HINT}</p>
        {missing.length ? (
          <Notice tone="warning">
            Still to fill in: {missing.map((m) => `{{${m}}}`).join(', ')}
            {missing.includes('schoolName') ? ' — choose the school on the right, or type the name in.' : null}
          </Notice>
        ) : null}

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => fileInputRef.current?.click()}>
              <Paperclip aria-hidden /> Attach files
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => {
                const picked = Array.from(e.target.files ?? [])
                setFiles((prev) => [...prev, ...picked].slice(0, 10))
                setDirty(true)
                e.target.value = ''
              }}
            />
            <span className={cn('text-xs', overLimit ? 'text-[var(--danger)]' : 'text-ink-subtle')}>
              {totalBytes ? `${formatBytes(totalBytes)} of ${MAX_ATTACHMENT_TOTAL_MB} MB` : `Up to ${MAX_ATTACHMENT_TOTAL_MB} MB in total`}
            </span>
          </div>
          {files.length || selectedDocs.length || forwarded.length ? (
            <ul className="flex flex-wrap gap-2">
              {forwarded.map((a) => (
                <AttachmentChip
                  key={`fwd-${a.index}`}
                  name={a.filename}
                  meta={`Original · ${formatBytes(a.size)}`}
                  onRemove={() => setForwardParts((parts) => parts.filter((x) => x !== a.index))}
                />
              ))}
              {selectedDocs.map((d) => (
                <AttachmentChip
                  key={d.id}
                  name={d.title}
                  meta={`Library · ${formatBytes(d.sizeBytes)}`}
                  onRemove={() => setDocumentIds((ids) => ids.filter((x) => x !== d.id))}
                />
              ))}
              {files.map((f, i) => (
                <AttachmentChip
                  key={`${f.name}-${i}`}
                  name={f.name}
                  meta={formatBytes(f.size)}
                  onRemove={() => setFiles((list) => list.filter((_, j) => j !== i))}
                />
              ))}
            </ul>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <Button
            type="submit"
            loading={sending && intent === 'send'}
            disabled={sending || !to.trim() || !subject.trim() || invalidAddresses.length > 0 || missing.length > 0 || overLimit}
          >
            <Send aria-hidden /> Send email
          </Button>
          <Button type="button" variant="secondary" onClick={openPreview} disabled={sending}>
            <Eye aria-hidden /> Preview
          </Button>
          <Button
            type="button"
            variant="ghost"
            loading={sending && intent === 'test'}
            disabled={sending || !subject.trim() || missing.length > 0 || overLimit}
            onClick={() => submit('test')}
            title={box ? `Sends one copy to ${box.fromEmail}` : undefined}
          >
            <FlaskConical aria-hidden /> Send test to me
          </Button>
        </div>
      </div>

      <aside className="space-y-4">
        <Panel title="Template">
          <Select aria-label="Template" value={templateKey} onChange={(e) => applyTemplate(e.target.value)}>
            <option value="">Choose a template…</option>
            {Array.from(new Set(templates.map((t) => t.group))).map((group) => (
              <optgroup key={group} label={group}>
                {templates
                  .filter((t) => t.group === group)
                  .map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </Select>
        </Panel>

        <Panel title="School (Growth CRM)" hint="Logs the email on the school's timeline and fills in its name.">
          <Select aria-label="CRM school" value={schoolId} onChange={(e) => chooseSchool(e.target.value)}>
            <option value="">Not linked to a school</option>
            {schools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          {school && school.contacts.length ? (
            <Field label="Addressed to" htmlFor="contactId" className="mt-2">
              <Select id="contactId" value={contactId} onChange={(e) => setContactId(e.target.value)}>
                <option value="">Sir / Madam</option>
                {school.contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fullName}
                    {c.designation ? ` · ${c.designation}` : ''}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
        </Panel>

        <Panel title="Design">
          <div className="space-y-2">
            {(Object.keys(MAIL_LAYOUT_LABELS) as MailLayout[]).map((l) => (
              <label key={l} className="flex cursor-pointer items-start gap-2 text-sm text-ink">
                <input
                  type="radio"
                  name="layout-choice"
                  className="mt-1 accent-[var(--brand-500)]"
                  checked={layout === l}
                  onChange={() => setLayout(l)}
                />
                {MAIL_LAYOUT_LABELS[l]}
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

        <Panel
          title="From the library"
          hint={documents.length ? undefined : 'Upload proposals once in Mail → Library to attach them here.'}
        >
          {documents.length ? (
            <ul className="max-h-64 space-y-1 overflow-y-auto">
              {documents.map((d) => (
                <li key={d.id}>
                  <label className="flex cursor-pointer items-start gap-2 rounded-[var(--radius-sm)] px-1.5 py-1 text-sm hover:bg-surface-2">
                    <Checkbox
                      className="mt-0.5"
                      checked={documentIds.includes(d.id)}
                      onChange={(e) => {
                        setDirty(true)
                        setDocumentIds((ids) => (e.target.checked ? [...ids, d.id] : ids.filter((x) => x !== d.id)))
                      }}
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

      <Dialog
        open={preview.open}
        onClose={() => setPreview({ open: false, loading: false })}
        title="Preview"
        description={subject ? `${subject} — exactly as recipients will see it` : 'Exactly as recipients will see it'}
        size="lg"
      >
        {preview.loading ? (
          <p className="py-16 text-center text-sm text-ink-muted">Building preview…</p>
        ) : preview.error ? (
          <Notice tone="danger">{preview.error}</Notice>
        ) : (
          <iframe
            title="Email preview"
            // No scripts, no same-origin: the preview is inert HTML.
            sandbox=""
            srcDoc={preview.html}
            className="h-[70vh] w-full rounded-[var(--radius-sm)] border border-line bg-white"
          />
        )}
      </Dialog>
    </form>
  )
}

function Row({
  label,
  children,
  action,
  last,
}: {
  label: string
  children: React.ReactNode
  action?: React.ReactNode
  last?: boolean
}) {
  return (
    <div className={cn('flex items-center gap-3 px-3', !last && 'border-b border-line')}>
      <span className="w-16 shrink-0 text-sm text-ink-subtle">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
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

function AttachmentChip({ name, meta, onRemove }: { name: string; meta: string; onRemove: () => void }) {
  return (
    <li className="flex max-w-xs items-center gap-2 rounded-[var(--radius-sm)] border border-line bg-surface-2 py-1.5 pl-2 pr-1">
      <FileText className="size-4 shrink-0 text-[#f45a1e]" aria-hidden />
      <span className="min-w-0">
        <span className="block truncate text-sm text-ink">{name}</span>
        <span className="block text-[11px] text-ink-subtle">{meta}</span>
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${name}`}
        className="grid size-6 shrink-0 place-items-center rounded-[var(--radius-sm)] text-ink-subtle hover:bg-surface hover:text-ink"
      >
        <X className="size-3.5" />
      </button>
    </li>
  )
}
