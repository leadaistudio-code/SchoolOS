'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { PlugZap, Trash2 } from 'lucide-react'
import { deleteMailboxAction, saveMailboxAction, testMailboxAction } from '../actions'
import { emptyFormState } from '@/lib/form-state'
import { HOSTINGER_PRESET } from '@/lib/platform-mail'
import { Button } from '@/components/ui/button'
import { Checkbox, Field, Input } from '@/components/ui/input'
import { Dialog } from '@/components/ui/dialog'
import { Notice } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'

const SEND_OPTIONS = [
  {
    value: 'SMTP',
    label: 'Directly through Hostinger (SMTP)',
    hint: 'Uses the mailbox password. Needs outbound ports 465/587, which some hosts block.',
  },
  {
    value: 'RESEND',
    label: 'Through Resend (HTTPS)',
    hint: 'For servers that block email ports, such as Railway below the Pro plan. Still sent from this address and saved to its Sent folder.',
  },
]

type Mailbox = {
  id: string
  fromName: string
  fromEmail: string
  replyTo: string | null
  username: string
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  sendVia: string
  hasResendKey: boolean
  imapEnabled: boolean
  imapHost: string
  imapPort: number
  signatureName: string | null
  signatureTitle: string | null
  signaturePhone: string | null
  signatureWebsite: string | null
  isDefault: boolean
}

export function MailboxForm({ mailbox }: { mailbox: Mailbox | null }) {
  const router = useRouter()
  const [state, action, pending] = useActionState(saveMailboxAction, emptyFormState)
  const [email, setEmail] = useState(mailbox?.fromEmail ?? '')
  const [sendVia, setSendVia] = useState(mailbox?.sendVia ?? 'SMTP')
  const err = state.fieldErrors

  useEffect(() => {
    if (state.ok && !mailbox) router.replace('/platform/mail/settings')
  }, [state.ok, mailbox, router])

  return (
    <form action={action} className="space-y-4" autoComplete="off">
      {mailbox ? <input type="hidden" name="id" value={mailbox.id} /> : null}
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.ok ? <Notice tone="success">{state.message}</Notice> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Sender name" htmlFor="fromName" required error={err.fromName} hint="Shown in the recipient's inbox">
          <Input id="fromName" name="fromName" required defaultValue={mailbox?.fromName ?? 'MyCampusView'} />
        </Field>
        <Field label="Email address" htmlFor="fromEmail" required error={err.fromEmail}>
          <Input
            id="fromEmail"
            name="fromEmail"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="contact@mycampusview.com"
          />
        </Field>
      </div>

      <Field
        label="Mailbox password"
        htmlFor="password"
        required={!mailbox}
        error={err.password}
        hint={mailbox ? 'Leave blank to keep the saved password' : 'The password of this email account in Hostinger'}
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required={!mailbox}
          placeholder={mailbox ? '••••••••  (saved)' : ''}
        />
      </Field>

      <fieldset className="space-y-2 rounded-[var(--radius-sm)] border border-line p-3">
        <legend className="px-1 text-sm font-medium text-ink">How emails are sent</legend>
        {SEND_OPTIONS.map((o) => (
          <label key={o.value} className="flex items-start gap-2 text-sm text-ink">
            <input
              type="radio"
              name="sendVia"
              value={o.value}
              checked={sendVia === o.value}
              onChange={() => setSendVia(o.value)}
              className="mt-0.5 size-4 cursor-pointer accent-[var(--brand-500)]"
            />
            <span>
              {o.label}
              <span className="block text-xs text-ink-subtle">{o.hint}</span>
            </span>
          </label>
        ))}
        {sendVia === 'RESEND' ? (
          <Field
            label="Resend API key"
            htmlFor="resendKey"
            required={!mailbox?.hasResendKey}
            error={err.resendKey}
            hint={
              mailbox?.hasResendKey
                ? 'Leave blank to keep the saved key'
                : `From resend.com → API Keys. Verify ${email.split('@')[1] || 'your domain'} under Resend → Domains first.`
            }
          >
            <Input
              id="resendKey"
              name="resendKey"
              type="password"
              autoComplete="off"
              required={!mailbox?.hasResendKey}
              placeholder={mailbox?.hasResendKey ? '••••••••  (saved)' : 're_…'}
            />
          </Field>
        ) : null}
      </fieldset>

      <Field label="Reply-to (optional)" htmlFor="replyTo" error={err.replyTo} hint="Where replies should go, if not this address">
        <Input id="replyTo" name="replyTo" type="email" defaultValue={mailbox?.replyTo ?? ''} />
      </Field>

      <fieldset className="space-y-3 rounded-[var(--radius-sm)] border border-line p-3">
        <legend className="px-1 text-sm font-medium text-ink">Signature</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" htmlFor="signatureName">
            <Input id="signatureName" name="signatureName" defaultValue={mailbox?.signatureName ?? ''} placeholder="Manmohan Singh" />
          </Field>
          <Field label="Designation" htmlFor="signatureTitle">
            <Input
              id="signatureTitle"
              name="signatureTitle"
              defaultValue={mailbox?.signatureTitle ?? ''}
              placeholder="Growth Manager, MyCampusView"
            />
          </Field>
          <Field label="Phone" htmlFor="signaturePhone">
            <Input id="signaturePhone" name="signaturePhone" defaultValue={mailbox?.signaturePhone ?? ''} placeholder="+91 …" />
          </Field>
          <Field label="Website" htmlFor="signatureWebsite">
            <Input
              id="signatureWebsite"
              name="signatureWebsite"
              defaultValue={mailbox?.signatureWebsite ?? 'www.mycampusview.com'}
            />
          </Field>
        </div>
        <p className="text-xs text-ink-subtle">Added under every email as “Warm regards,” followed by these details and the email address.</p>
      </fieldset>

      <details className="group rounded-[var(--radius-sm)] border border-line p-3" open={!!mailbox && mailbox.smtpHost !== HOSTINGER_PRESET.smtpHost}>
        <summary className="cursor-pointer text-sm font-medium text-ink">
          Server settings <span className="font-normal text-ink-subtle">— pre-filled for Hostinger</span>
        </summary>
        <div className="mt-3 space-y-3">
          <Field label="Login username" htmlFor="username" hint="Normally the full email address">
            <Input id="username" name="username" defaultValue={mailbox?.username ?? ''} placeholder={email || 'Same as email address'} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_100px]">
            <Field label="SMTP server" htmlFor="smtpHost" error={err.smtpHost}>
              <Input id="smtpHost" name="smtpHost" defaultValue={mailbox?.smtpHost ?? HOSTINGER_PRESET.smtpHost} />
            </Field>
            <Field label="Port" htmlFor="smtpPort">
              <Input id="smtpPort" name="smtpPort" inputMode="numeric" defaultValue={mailbox?.smtpPort ?? HOSTINGER_PRESET.smtpPort} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-ink">
            <Checkbox name="smtpSecure" defaultChecked={mailbox?.smtpSecure ?? HOSTINGER_PRESET.smtpSecure} />
            Use SSL (port 465). Untick for STARTTLS on port 587.
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <Checkbox name="imapEnabled" defaultChecked={mailbox?.imapEnabled ?? true} />
            Read the inbox and save sent emails to the Sent folder (IMAP)
          </label>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_100px]">
            <Field label="IMAP server" htmlFor="imapHost">
              <Input id="imapHost" name="imapHost" defaultValue={mailbox?.imapHost ?? HOSTINGER_PRESET.imapHost} />
            </Field>
            <Field label="Port" htmlFor="imapPort">
              <Input id="imapPort" name="imapPort" inputMode="numeric" defaultValue={mailbox?.imapPort ?? HOSTINGER_PRESET.imapPort} />
            </Field>
          </div>
        </div>
      </details>

      <label className="flex items-center gap-2 text-sm text-ink">
        <Checkbox name="isDefault" defaultChecked={mailbox?.isDefault ?? true} />
        Default mailbox — also used for quick emails from the Growth CRM
      </label>

      <div className="flex gap-2">
        <Button type="submit" loading={pending}>
          {mailbox ? 'Save changes' : 'Connect mailbox'}
        </Button>
        {mailbox ? (
          <Button type="button" variant="ghost" onClick={() => router.push('/platform/mail/settings')}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  )
}

export function TestMailboxPanel({ id, defaultTo }: { id: string; defaultTo: string }) {
  const router = useRouter()
  const [to, setTo] = useState(defaultTo)
  const [sendTest, setSendTest] = useState(true)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <div className="space-y-2 rounded-[var(--radius-sm)] bg-surface-2 p-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex items-center gap-2 text-sm text-ink">
          <Checkbox checked={sendTest} onChange={(e) => setSendTest(e.target.checked)} />
          Also send a test email to
        </label>
        <Input
          aria-label="Test recipient"
          className="h-8 max-w-64 text-sm"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          disabled={!sendTest}
        />
        <Button
          size="sm"
          variant="secondary"
          loading={pending}
          onClick={() =>
            startTransition(async () => {
              setResult(null)
              const r = await testMailboxAction(id, sendTest ? to : null)
              setResult(r)
              router.refresh()
            })
          }
        >
          <PlugZap aria-hidden /> Test connection
        </Button>
      </div>
      {result ? <Notice tone={result.ok ? 'success' : 'danger'}>{result.message}</Notice> : null}
    </div>
  )
}

export function DeleteMailboxButton({ id, email }: { id: string; email: string }) {
  const router = useRouter()
  const { push } = useToast()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        <Trash2 aria-hidden /> Disconnect
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Disconnect this mailbox?"
        description={`${email} will no longer be available to send from. Emails already sent stay in the log.`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={() =>
                startTransition(async () => {
                  const r = await deleteMailboxAction(id)
                  push({ title: r.message, tone: r.ok ? 'success' : 'error' })
                  setOpen(false)
                  router.push('/platform/mail/settings')
                  router.refresh()
                })
              }
            >
              Disconnect
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-muted">The saved password is deleted with it.</p>
      </Dialog>
    </>
  )
}
