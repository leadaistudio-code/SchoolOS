'use client'

import * as React from 'react'
import { useActionState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, CheckCircle2, Send, Unplug } from 'lucide-react'
import { disconnectMailAction, saveMailSettingsAction, testMailAction } from './actions'
import { emptyFormState } from '@/lib/form-state'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox, Field, FormActions, FormSection, Input } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'
import type { SmtpSettings } from '@/server/mail/smtp'

/**
 * Presets for the mail services schools actually use.
 *
 * Filling the host and port from a chosen provider removes the two fields
 * people most often get wrong, without hiding them: everything stays editable
 * for a school running its own server.
 */
const PRESETS = [
  { label: 'Google Workspace', host: 'smtp.gmail.com', port: 587, secure: false },
  { label: 'Microsoft 365', host: 'smtp.office365.com', port: 587, secure: false },
  { label: 'Zoho Mail', host: 'smtp.zoho.in', port: 465, secure: true },
  { label: 'Amazon SES', host: 'email-smtp.ap-south-1.amazonaws.com', port: 587, secure: false },
] as const

export function MailForm({
  settings,
  testRecipient,
}: {
  settings: SmtpSettings | null
  /** Defaults to the signed-in administrator, who is the obvious test target. */
  testRecipient: string
}) {
  const router = useRouter()
  const toast = useToast()
  const [state, formAction, pending] = useActionState(saveMailSettingsAction, emptyFormState)

  const [host, setHost] = React.useState(settings?.host ?? '')
  const [port, setPort] = React.useState(String(settings?.port ?? 587))
  const [secure, setSecure] = React.useState(settings?.secure ?? false)
  const [recipient, setRecipient] = React.useState(testRecipient)
  const [testing, setTesting] = React.useState(false)
  const [disconnecting, setDisconnecting] = React.useState(false)

  React.useEffect(() => {
    if (!state.ok) return
    toast.push({
      tone: 'success',
      title: 'Saved',
      description: 'Send a test message to confirm the connection works.',
    })
    router.refresh()
  }, [state.ok, toast, router])

  const applyPreset = (preset: (typeof PRESETS)[number]) => {
    setHost(preset.host)
    setPort(String(preset.port))
    setSecure(preset.secure)
  }

  const runTest = async () => {
    setTesting(true)
    const result = await testMailAction(recipient)
    setTesting(false)
    toast.push({
      tone: result.ok ? 'success' : 'error',
      title: result.ok ? 'Test sent' : 'Test failed',
      description: result.message,
    })
    router.refresh()
  }

  const disconnect = async () => {
    setDisconnecting(true)
    const result = await disconnectMailAction()
    setDisconnecting(false)
    toast.push({
      tone: result.ok ? 'success' : 'error',
      title: result.ok ? 'Disconnected' : 'Could not disconnect',
      description: result.message,
    })
    router.refresh()
  }

  const err = (field: string) => state.fieldErrors[field]

  return (
    <div className="space-y-3">
      {settings?.verifiedAt ? (
        <Notice tone="success" title="Connected">
          A test message was delivered successfully on{' '}
          {new Date(settings.verifiedAt).toLocaleString('en-IN')}. Outgoing school email is being
          sent from {settings.fromEmail}.
        </Notice>
      ) : settings?.lastError ? (
        <Notice tone="danger" title="The last attempt failed">
          {settings.lastError}
        </Notice>
      ) : settings ? (
        <Notice tone="warning" title="Not verified yet">
          These settings have been saved but never proved. Send a test message before relying on
          them for fee reminders.
        </Notice>
      ) : (
        <Notice tone="info" title="Using the platform sender">
          School email currently goes out through SchoolOS. Connect your own mailbox to send from
          your school&rsquo;s address instead.
        </Notice>
      )}

      <form action={formAction} noValidate>
        <Card>
          <CardContent className="space-y-6 pt-5">
            {state.error ? (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-[var(--radius)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-danger-bg px-3.5 py-2.5"
              >
                <AlertCircle className="mt-0.5 size-4.5 shrink-0 text-[var(--danger)]" aria-hidden />
                <p className="text-sm text-[var(--danger)]">{state.error}</p>
              </div>
            ) : null}

            <FormSection
              title="Mail server"
              description="The SMTP details from your email provider. Your password is encrypted before it is stored and is never shown again."
            >
              <div className="sm:col-span-2">
                <p className="caption mb-1.5">Start from a provider</p>
                <div className="flex flex-wrap gap-1.5">
                  {PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => applyPreset(preset)}
                      className="rounded-full border border-line px-2.5 py-1 text-xs text-ink-muted transition-colors hover:border-[var(--product-500)] hover:text-[var(--product-600)]"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <Field label="SMTP server" htmlFor="host" required error={err('host')}>
                <Input
                  id="host"
                  name="host"
                  required
                  value={host}
                  onChange={(event) => setHost(event.target.value)}
                  placeholder="smtp.gmail.com"
                />
              </Field>

              <Field
                label="Port"
                htmlFor="port"
                required
                error={err('port')}
                hint="587 for STARTTLS, 465 for TLS"
              >
                <Input
                  id="port"
                  name="port"
                  type="number"
                  required
                  value={port}
                  onChange={(event) => setPort(event.target.value)}
                />
              </Field>

              <Field label="Username" htmlFor="username" error={err('username')}>
                <Input
                  id="username"
                  name="username"
                  defaultValue={settings?.username ?? ''}
                  autoComplete="off"
                  placeholder="office@yourschool.edu.in"
                />
              </Field>

              <Field
                label="Password"
                htmlFor="password"
                error={err('password')}
                hint={
                  settings?.hasPassword
                    ? 'A password is stored. Leave blank to keep it.'
                    : 'Most providers require an app password rather than the account password.'
                }
              >
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  placeholder={settings?.hasPassword ? '••••••••••' : ''}
                />
              </Field>

              <Field label="Use TLS on connect" htmlFor="secure">
                <label className="flex items-center gap-2 text-sm text-ink-muted">
                  <Checkbox
                    id="secure"
                    name="secure"
                    checked={secure}
                    onChange={(event) => setSecure(event.target.checked)}
                  />
                  Required on port 465
                </label>
              </Field>
            </FormSection>

            <FormSection
              title="Sender"
              description="How the school appears in a parent's inbox."
            >
              <Field label="Sender name" htmlFor="fromName" required error={err('fromName')}>
                <Input
                  id="fromName"
                  name="fromName"
                  required
                  defaultValue={settings?.fromName ?? ''}
                  placeholder="Delhi International School"
                />
              </Field>

              <Field label="Sender address" htmlFor="fromEmail" required error={err('fromEmail')}>
                <Input
                  id="fromEmail"
                  name="fromEmail"
                  type="email"
                  required
                  defaultValue={settings?.fromEmail ?? ''}
                  placeholder="office@yourschool.edu.in"
                />
              </Field>

              <Field
                label="Reply-to address"
                htmlFor="replyTo"
                error={err('replyTo')}
                hint="Where replies from parents should land"
              >
                <Input
                  id="replyTo"
                  name="replyTo"
                  type="email"
                  defaultValue={settings?.replyTo ?? ''}
                />
              </Field>

              <Field label="Send through this server" htmlFor="enabled">
                <label className="flex items-center gap-2 text-sm text-ink-muted">
                  <Checkbox id="enabled" name="enabled" defaultChecked={settings?.enabled ?? true} />
                  Use for all outgoing school email
                </label>
              </Field>
            </FormSection>

            <FormActions>
              <Button type="submit" loading={pending}>
                Save settings
              </Button>
              {settings ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={disconnect}
                  loading={disconnecting}
                  className="ml-auto"
                >
                  <Unplug className="size-4" aria-hidden />
                  Disconnect
                </Button>
              ) : null}
            </FormActions>
          </CardContent>
        </Card>
      </form>

      {settings ? (
        <Card>
          <CardContent className="space-y-3 pt-5">
            <div>
              <h2 className="text-base font-semibold text-ink">Send a test message</h2>
              <p className="mt-0.5 text-sm text-ink-muted">
                Proves the server accepts the credentials and delivers mail. Nothing is trusted
                until this succeeds.
              </p>
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-56 flex-1">
                <span className="mb-1 block text-sm font-medium text-ink">Send to</span>
                <Input
                  type="email"
                  value={recipient}
                  onChange={(event) => setRecipient(event.target.value)}
                />
              </label>
              <Button variant="secondary" onClick={runTest} loading={testing} disabled={!recipient}>
                <Send className="size-4" aria-hidden />
                Send test
              </Button>
            </div>

            {settings.verifiedAt ? (
              <p className="flex items-center gap-1.5 text-xs text-success">
                <CheckCircle2 className="size-3.5" aria-hidden />
                Last verified {new Date(settings.verifiedAt).toLocaleString('en-IN')}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
