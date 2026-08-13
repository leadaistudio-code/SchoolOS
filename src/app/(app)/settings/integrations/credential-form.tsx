'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox, Field, Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import type { CredentialView } from '@/server/modules/settings/integrations'
import { saveIntegrationAction } from '../admin-actions'

type Copy = {
  title: string
  blurb: string
  accountLabel: string
  keyLabel: string
  secretLabel: string
  senderLabel?: string
}

/**
 * One vendor account.
 *
 * The secret fields start empty and blank means "leave it alone" — the server
 * never sends a stored secret back to a browser, so there is nothing to
 * prefill and no way for this form to leak one. What it does show is whether
 * a value is on file, which is the only thing an administrator needs to know
 * before deciding to retype it.
 */
export function CredentialForm({
  credential,
  copy,
}: {
  credential: CredentialView
  copy: Copy
}) {
  const toast = useToast()
  const [pending, startTransition] = React.useTransition()
  const [enabled, setEnabled] = React.useState(credential.enabled)
  const [accountId, setAccountId] = React.useState(credential.accountId ?? '')
  const [senderId, setSenderId] = React.useState(credential.senderId ?? '')
  const [apiKey, setApiKey] = React.useState('')
  const [apiSecret, setApiSecret] = React.useState('')

  const submit = () =>
    startTransition(async () => {
      const result = await saveIntegrationAction({
        kind: credential.kind,
        enabled,
        accountId: accountId.trim() || undefined,
        senderId: senderId.trim() || undefined,
        apiKey: apiKey || undefined,
        apiSecret: apiSecret || undefined,
      })
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Could not save', description: result.message })
        return
      }
      toast.push({ tone: 'success', title: `${copy.title} saved`, description: result.message })
      setApiKey('')
      setApiSecret('')
    })

  return (
    <div className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-medium text-ink">{copy.title}</h3>
          <p className="mt-0.5 max-w-2xl text-sm text-ink-muted">{copy.blurb}</p>
        </div>
        <label className="flex shrink-0 items-center gap-2">
          <Checkbox checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span className="text-sm text-ink">Use this account</span>
        </label>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label={copy.accountLabel} htmlFor={`${credential.kind}-account`}>
          <Input
            id={`${credential.kind}-account`}
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          />
        </Field>

        {copy.senderLabel ? (
          <Field label={copy.senderLabel} htmlFor={`${credential.kind}-sender`}>
            <Input
              id={`${credential.kind}-sender`}
              value={senderId}
              onChange={(e) => setSenderId(e.target.value)}
            />
          </Field>
        ) : null}

        <Field
          label={copy.keyLabel}
          htmlFor={`${credential.kind}-key`}
          hint={credential.hasApiKey ? 'On file — type to replace it' : 'Not set'}
        >
          <Input
            id={`${credential.kind}-key`}
            type="password"
            autoComplete="off"
            value={apiKey}
            placeholder={credential.hasApiKey ? '••••••••' : ''}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </Field>

        <Field
          label={copy.secretLabel}
          htmlFor={`${credential.kind}-secret`}
          hint={credential.hasApiSecret ? 'On file — type to replace it' : 'Not set'}
        >
          <Input
            id={`${credential.kind}-secret`}
            type="password"
            autoComplete="off"
            value={apiSecret}
            placeholder={credential.hasApiSecret ? '••••••••' : ''}
            onChange={(e) => setApiSecret(e.target.value)}
          />
        </Field>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <Button size="sm" loading={pending} onClick={submit}>
          Save {copy.title.toLowerCase()}
        </Button>
        {credential.updatedAt ? (
          <span className="text-xs text-ink-subtle">
            Last changed {new Date(credential.updatedAt).toLocaleDateString()}
          </span>
        ) : null}
      </div>
    </div>
  )
}
