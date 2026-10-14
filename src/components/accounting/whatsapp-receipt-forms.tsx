'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'
import { callApi, FormDialog, useSubmit } from './payables-forms'

/** The school's switch for WhatsApp fee receipts. */
export function ReceiptsToggle({ enabled, available, ready }: { enabled: boolean; available: boolean; ready: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const toggle = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    const result = await callApi('/api/v1/accounting/whatsapp-receipts/settings', { method: 'POST', body: { enabled: !enabled } })
    setBusy(false)
    if (!result.ok) setError(result.message)
    else router.refresh()
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant={enabled ? 'secondary' : 'primary'} disabled={busy || (!enabled && (!available || !ready))} onClick={() => void toggle()}>
          {busy ? 'Saving…' : enabled ? 'Switch off WhatsApp receipts' : 'Switch on WhatsApp receipts'}
        </Button>
        {!enabled && !available ? <span className="text-xs text-ink-subtle">Not available on this deployment (WHATSAPP_RECEIPTS_ENABLED is off).</span> : null}
        {!enabled && available && !ready ? <span className="text-xs text-ink-subtle">Finish the provider settings below first.</span> : null}
      </div>
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </div>
  )
}

export type ConfigFormValue = {
  provider: 'META_CLOUD' | 'AISENSY'
  phoneNumberId: string | null
  templateName: string | null
  templateLanguage: string
  campaignName: string | null
  hasAccessToken: boolean
  hasAppSecret: boolean
  hasApiKey: boolean
} | null

const SAVED = 'Saved. Leave blank to keep it.'

export function ReceiptConfigForm({ value }: { value: ConfigFormValue }) {
  const router = useRouter()
  const [provider, setProvider] = React.useState<'META_CLOUD' | 'AISENSY'>(value?.provider ?? 'META_CLOUD')
  const [busy, setBusy] = React.useState(false)
  const [message, setMessage] = React.useState<{ tone: 'danger' | 'success'; text: string } | null>(null)
  const switching = !!value && value.provider !== provider

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (busy) return
    const form = e.currentTarget
    const f = new FormData(form)
    const text = (k: string) => String(f.get(k) ?? '').trim() || undefined
    setBusy(true)
    setMessage(null)
    const result = await callApi('/api/v1/accounting/whatsapp-receipts/config', {
      method: 'PUT',
      body: {
        provider,
        phoneNumberId: text('phoneNumberId'),
        templateName: text('templateName'),
        templateLanguage: text('templateLanguage') ?? 'en',
        campaignName: text('campaignName'),
        accessToken: text('accessToken'),
        appSecret: text('appSecret'),
        apiKey: text('apiKey'),
      },
    })
    setBusy(false)
    if (!result.ok) {
      setMessage({ tone: 'danger', text: result.message })
      return
    }
    for (const name of ['accessToken', 'appSecret', 'apiKey']) {
      const input = form.elements.namedItem(name)
      if (input instanceof HTMLInputElement) input.value = ''
    }
    setMessage({ tone: 'success', text: 'Saved. Secrets are stored encrypted and are never shown again.' })
    router.refresh()
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4" autoComplete="off">
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      <Field label="Provider" htmlFor="wr-provider">
        <Select id="wr-provider" value={provider} onChange={(e) => setProvider(e.target.value as 'META_CLOUD' | 'AISENSY')}>
          <option value="META_CLOUD">Meta WhatsApp Cloud API (the school&apos;s own WhatsApp Business account)</option>
          <option value="AISENSY">AiSensy</option>
        </Select>
      </Field>
      {switching ? <Notice tone="warning">Switching provider clears the saved secrets for the old one.</Notice> : null}

      {provider === 'META_CLOUD' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone number id" hint="From WhatsApp Manager → API setup" htmlFor="wr-pnid">
            <Input id="wr-pnid" name="phoneNumberId" inputMode="numeric" defaultValue={value?.phoneNumberId ?? ''} maxLength={40} />
          </Field>
          <Field label="Approved template name" hint="Utility category, e.g. fee_receipt" htmlFor="wr-tpl">
            <Input id="wr-tpl" name="templateName" defaultValue={value?.templateName ?? ''} maxLength={512} />
          </Field>
          <Field label="Template language" hint="As approved, e.g. en or en_US" htmlFor="wr-lang">
            <Input id="wr-lang" name="templateLanguage" defaultValue={value?.templateLanguage ?? 'en'} maxLength={8} />
          </Field>
          <Field label="Permanent access token" hint={value?.hasAccessToken && !switching ? SAVED : 'System-user token with whatsapp_business_messaging'} htmlFor="wr-token">
            <Input id="wr-token" name="accessToken" type="password" autoComplete="new-password" maxLength={2000} />
          </Field>
          <Field label="App secret" hint={value?.hasAppSecret && !switching ? SAVED : 'Used to verify delivery updates from Meta'} htmlFor="wr-secret">
            <Input id="wr-secret" name="appSecret" type="password" autoComplete="new-password" maxLength={200} />
          </Field>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="API campaign name" hint="A live API campaign using the approved receipt template" htmlFor="wr-campaign">
            <Input id="wr-campaign" name="campaignName" defaultValue={value?.campaignName ?? ''} maxLength={200} />
          </Field>
          <Field label="Template language" htmlFor="wr-lang2">
            <Input id="wr-lang2" name="templateLanguage" defaultValue={value?.templateLanguage ?? 'en'} maxLength={8} />
          </Field>
          <Field label="AiSensy API key" hint={value?.hasApiKey && !switching ? SAVED : 'From AiSensy → Manage → API key'} htmlFor="wr-apikey">
            <Input id="wr-apikey" name="apiKey" type="password" autoComplete="new-password" maxLength={4000} />
          </Field>
        </div>
      )}
      <div className="flex justify-end">
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</Button>
      </div>
    </form>
  )
}

export function RotateWebhookButton() {
  return (
    <FormDialog title="Issue a new delivery-status URL" size="sm" trigger={(open) => <Button size="sm" variant="secondary" onClick={open}>New URL</Button>}>
      {(close) => <RotateForm onDone={close} />}
    </FormDialog>
  )
}

function RotateForm({ onDone }: { onDone: () => void }) {
  const { busy, error, run } = useSubmit(onDone)
  return (
    <div className="space-y-3">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <p className="text-sm text-ink-muted">
        The current URL stops working at once. Paste the new one into the provider&apos;s webhook settings, or delivery updates and STOP replies will be lost.
      </p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>Back</Button>
        <Button disabled={busy} onClick={() => void run(() => callApi('/api/v1/accounting/whatsapp-receipts/config', { method: 'POST' }))}>
          {busy ? 'Working…' : 'Issue new URL'}
        </Button>
      </div>
    </div>
  )
}

export function ConsentButton({ phone, masked, guardian, optedIn }: { phone: string; masked: string; guardian: string; optedIn: boolean }) {
  return (
    <FormDialog
      title={optedIn ? 'Record opt-out' : 'Record WhatsApp consent'}
      description={`${guardian} · ${masked}`}
      size="sm"
      trigger={(open) => <Button size="sm" variant={optedIn ? 'ghost' : 'secondary'} onClick={open}>{optedIn ? 'Opt out' : 'Record consent'}</Button>}
    >
      {(close) => <ConsentForm phone={phone} optedIn={optedIn} onDone={close} />}
    </FormDialog>
  )
}

function ConsentForm({ phone, optedIn, onDone }: { phone: string; optedIn: boolean; onDone: () => void }) {
  const { busy, error, run } = useSubmit(onDone)
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    void run(() => callApi('/api/v1/accounting/whatsapp-receipts/consent', {
      method: 'POST',
      body: {
        phone,
        status: optedIn ? 'OPTED_OUT' : 'OPTED_IN',
        source: String(f.get('source') ?? 'form'),
        note: String(f.get('note') ?? '').trim() || undefined,
      },
    }))
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <p className="text-sm text-ink-muted">
        {optedIn
          ? 'Fee receipts will no longer be sent to this number on WhatsApp.'
          : 'Only record consent the parent has actually given. Receipts will be sent to this number on WhatsApp; the parent can reply STOP at any time.'}
      </p>
      <Field label="How" htmlFor="wc-source">
        <Select id="wc-source" name="source" defaultValue={optedIn ? 'parent_request' : 'form'}>
          <option value="form">Signed form</option>
          <option value="verbal">Told the office</option>
          <option value="parent_request">Parent asked</option>
        </Select>
      </Field>
      <Field label="Note" htmlFor="wc-note">
        <Textarea id="wc-note" name="note" rows={2} maxLength={300} placeholder="e.g. admission form, page 2" />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>Back</Button>
        <Button type="submit" disabled={busy} variant={optedIn ? 'danger' : 'primary'}>{busy ? 'Saving…' : optedIn ? 'Record opt-out' : 'Record consent'}</Button>
      </div>
    </form>
  )
}

export function RetryOutboxButton({ id, interrupted }: { id: string; interrupted: boolean }) {
  return (
    <FormDialog title="Send again" size="sm" trigger={(open) => <Button size="sm" variant="secondary" onClick={open}>Retry</Button>}>
      {(close) => <RetryForm id={id} interrupted={interrupted} onDone={close} />}
    </FormDialog>
  )
}

function RetryForm({ id, interrupted, onDone }: { id: string; interrupted: boolean; onDone: () => void }) {
  const { busy, error, run } = useSubmit(onDone)
  return (
    <div className="space-y-3">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {interrupted ? (
        <Notice tone="warning">The last attempt stopped mid-send, so the parent may already have this message. Check before sending it again.</Notice>
      ) : null}
      <p className="text-sm text-ink-muted">The recipient, consent and settings are checked again before it is sent.</p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>Back</Button>
        <Button disabled={busy} onClick={() => void run(() => callApi(`/api/v1/accounting/whatsapp-receipts/outbox/${id}/retry`, { method: 'POST' }))}>
          {busy ? 'Working…' : 'Send again'}
        </Button>
      </div>
    </div>
  )
}
