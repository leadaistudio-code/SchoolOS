'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FastForward, Pause, RotateCcw, Send, XCircle } from 'lucide-react'
import { BATCH_SIZES, DEFAULT_BATCH_SIZE } from '@/lib/bulk-mail'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { useToast } from '@/components/ui/toast'
import { cancelCampaignAction, retryFailedAction, sendBatchAction } from '../actions'

const PAUSE_BETWEEN_BATCHES_S = 8

type LogLine = { at: Date; text: string; tone: 'ok' | 'warn' | 'error' }

export function SendPanel({
  campaignId,
  open,
  sent,
  pending,
  failed,
  target,
  fromEmail,
}: {
  campaignId: string
  open: boolean
  sent: number
  pending: number
  failed: number
  target: number
  fromEmail: string | null
}) {
  const router = useRouter()
  const { push } = useToast()
  const [size, setSize] = useState<number>(DEFAULT_BATCH_SIZE)
  const [busy, setBusy] = useState<'batch' | 'auto' | 'retry' | 'cancel' | null>(null)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [log, setLog] = useState<LogLine[]>([])
  const stopRef = useRef(false)

  useEffect(() => {
    if (busy !== 'auto') return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [busy])

  const add = (text: string, tone: LogLine['tone']) => setLog((l) => [{ at: new Date(), text, tone }, ...l].slice(0, 30))

  async function runBatch(): Promise<{ remaining: number; stop: boolean }> {
    const r = await sendBatchAction(campaignId, size)
    router.refresh()
    if (r.error || !r.result) {
      add(r.error ?? 'The batch could not be sent', 'error')
      return { remaining: 0, stop: true }
    }
    const { sent: s, failed: f, skipped: k, remaining, error } = r.result
    const parts = [`${s} sent`]
    if (f) parts.push(`${f} failed`)
    if (k) parts.push(`${k} skipped (unsubscribed)`)
    parts.push(`${remaining} waiting`)
    add(parts.join(' · '), error ? 'error' : f ? 'warn' : 'ok')
    if (error) add(error, 'error')
    return { remaining, stop: !!error }
  }

  async function sendOne() {
    setBusy('batch')
    const { remaining } = await runBatch()
    setBusy(null)
    if (remaining === 0) push({ title: 'Every school on the list has been processed', tone: 'success' })
  }

  async function sendAll() {
    if (!window.confirm(`Send to all ${pending} waiting school${pending === 1 ? '' : 's'}, ${size} at a time? Keep this page open until it finishes.`)) return
    stopRef.current = false
    setBusy('auto')
    for (;;) {
      const { remaining, stop } = await runBatch()
      if (stop || remaining === 0 || stopRef.current) {
        if (remaining === 0 && !stop) push({ title: 'Campaign complete', description: 'Every school on the list has been processed.', tone: 'success' })
        if (stopRef.current && remaining > 0) add(`Paused with ${remaining} still waiting`, 'warn')
        break
      }
      for (let s = PAUSE_BETWEEN_BATCHES_S; s > 0; s--) {
        if (stopRef.current) break
        setCountdown(s)
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
      setCountdown(null)
      if (stopRef.current) {
        add(`Paused with ${remaining} still waiting`, 'warn')
        break
      }
    }
    setCountdown(null)
    setBusy(null)
  }

  async function retry() {
    setBusy('retry')
    const r = await retryFailedAction(campaignId)
    push({ title: r.message, tone: r.ok ? 'success' : 'error' })
    router.refresh()
    setBusy(null)
  }

  async function cancel() {
    if (!window.confirm('Cancel this campaign? Schools still waiting will not be emailed. Emails already sent stay sent.')) return
    setBusy('cancel')
    const r = await cancelCampaignAction(campaignId)
    push({ title: r.message, tone: r.ok ? 'success' : 'error' })
    router.refresh()
    setBusy(null)
  }

  const pct = target ? (sent / target) * 100 : 0

  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Sending</h2>
          <p className="mt-0.5 text-xs text-ink-subtle">
            {open
              ? `Each school gets its own email from ${fromEmail}, about 1.5 seconds apart.`
              : pending === 0 && failed === 0
                ? 'Every school on the list has been processed.'
                : 'This campaign is closed.'}
          </p>
        </div>
        <span className="text-sm font-medium text-ink tnum">
          {sent} of {target} sent
        </span>
      </div>
      <Progress value={pct} tone={pending === 0 ? 'success' : 'brand'} className="mt-3 h-2.5" label="Campaign progress" />

      {open ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            Batch of
            <Select value={size} onChange={(e) => setSize(Number(e.target.value))} disabled={!!busy} className="h-9 w-20" aria-label="Batch size">
              {BATCH_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
            schools
          </label>
          <Button type="button" onClick={sendOne} loading={busy === 'batch'} disabled={!!busy || pending === 0}>
            <Send aria-hidden /> Send next {Math.min(size, pending) || size}
          </Button>
          {busy === 'auto' ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                stopRef.current = true
                add('Stopping after this batch…', 'warn')
              }}
            >
              <Pause aria-hidden /> {countdown ? `Pause (next batch in ${countdown}s)` : 'Pause after this batch'}
            </Button>
          ) : (
            <Button type="button" variant="secondary" onClick={sendAll} disabled={!!busy || pending === 0}>
              <FastForward aria-hidden /> Send all {pending}
            </Button>
          )}
          {failed ? (
            <Button type="button" variant="ghost" onClick={retry} loading={busy === 'retry'} disabled={!!busy}>
              <RotateCcw aria-hidden /> Retry {failed} failed
            </Button>
          ) : null}
          <Button type="button" variant="ghost" onClick={cancel} loading={busy === 'cancel'} disabled={!!busy} className="ml-auto text-[var(--danger)]">
            <XCircle aria-hidden /> Cancel campaign
          </Button>
        </div>
      ) : failed && pending === 0 ? (
        <div className="mt-4">
          <Button type="button" variant="secondary" onClick={retry} loading={busy === 'retry'} disabled={!!busy}>
            <RotateCcw aria-hidden /> Retry {failed} failed
          </Button>
        </div>
      ) : null}

      {busy === 'batch' || busy === 'auto' ? (
        <p className="mt-3 text-xs text-ink-subtle">Sending… keep this page open. You can safely pause; nothing is sent twice.</p>
      ) : null}

      {log.length ? (
        <ol className="mt-4 max-h-48 space-y-1 overflow-y-auto rounded-[var(--radius-sm)] bg-surface-2 p-3 font-mono text-xs">
          {log.map((l, i) => (
            <li
              key={i}
              className={l.tone === 'error' ? 'text-[var(--danger)]' : l.tone === 'warn' ? 'text-warning' : 'text-ink-muted'}
            >
              <span className="text-ink-subtle">{l.at.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>{' '}
              {l.text}
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  )
}
