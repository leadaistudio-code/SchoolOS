'use client'

import { useState } from 'react'
import { CheckCircle2 } from 'lucide-react'

const REASONS = [
  'We already use another school ERP',
  'Not relevant to our school',
  'Too many emails',
  'Please contact a different person',
]

export function UnsubscribeForm({
  token,
  email,
  schoolName,
  alreadyDone,
}: {
  token: string
  email: string
  schoolName: string | null
  alreadyDone: boolean
}) {
  const [done, setDone] = useState(alreadyDone)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/site/unsubscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, reason: reason || null }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
        throw new Error(body?.error?.message ?? 'Something went wrong')
      }
      setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div>
        <span className="grid size-11 place-items-center rounded-full bg-[#e8f6ee] text-[#15803d]">
          <CheckCircle2 className="size-6" aria-hidden />
        </span>
        <h1 className="mt-4 text-xl font-semibold text-[#0a1024]">You have been unsubscribed</h1>
        <p className="mt-2 text-[15px] leading-6 text-[#3d4759]">
          <strong className="font-semibold text-[#0a1024]">{email}</strong> will not receive any more emails from
          MyCampusView. Thank you for letting us know.
        </p>
        <p className="mt-4 text-sm leading-6 text-[#5b6577]">
          If this was a mistake, write to{' '}
          <a href="mailto:contact@mycampusview.com" className="font-medium text-[#002046] underline">
            contact@mycampusview.com
          </a>{' '}
          and we will add you back.
        </p>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-[#0a1024]">Unsubscribe from MyCampusView emails</h1>
      <p className="mt-2 text-[15px] leading-6 text-[#3d4759]">
        Stop sending emails to <strong className="font-semibold text-[#0a1024]">{email}</strong>
        {schoolName ? <> at {schoolName}</> : null}.
      </p>

      <fieldset className="mt-6">
        <legend className="text-sm font-medium text-[#0a1024]">Tell us why (optional)</legend>
        <div className="mt-2 space-y-1.5">
          {REASONS.map((r) => (
            <label key={r} className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-[#eceef3] px-3 py-2 text-sm text-[#3d4759] hover:border-[#c9cfda]">
              <input
                type="radio"
                name="reason"
                value={r}
                checked={reason === r}
                onChange={() => setReason(r)}
                className="accent-[#f45a1e]"
              />
              {r}
            </label>
          ))}
        </div>
      </fieldset>

      {error ? (
        <p className="mt-4 text-sm text-[#b42318]" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-lg bg-[#f45a1e] px-5 text-[15px] font-semibold text-white transition-colors hover:bg-[#e04d14] disabled:opacity-60"
      >
        {busy ? 'Unsubscribing…' : 'Unsubscribe'}
      </button>
      <p className="mt-3 text-center text-xs text-[#7b8394]">You will not receive any further emails from us.</p>
    </div>
  )
}
