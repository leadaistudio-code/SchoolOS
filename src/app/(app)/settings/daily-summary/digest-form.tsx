'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Send, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox, Field, Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import type { DigestConfig } from '@/lib/daily-digest'
import { saveDigestAction, sendTestAction } from './actions'

type UserOption = { id: string; name: string; phone: string | null; roles: string }

export function DigestForm({ config, users }: { config: DigestConfig; users: UserOption[] }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = useTransition()
  const [morningEnabled, setMorningEnabled] = useState(config.morningEnabled)
  const [morningTime, setMorningTime] = useState(config.morningTime)
  const [eveningEnabled, setEveningEnabled] = useState(config.eveningEnabled)
  const [eveningTime, setEveningTime] = useState(config.eveningTime)
  const [skipSundays, setSkipSundays] = useState(config.skipSundays)
  const [recipients, setRecipients] = useState<Set<string>>(new Set(config.recipientUserIds))
  const [phones, setPhones] = useState(config.extraPhones)

  const toggle = (id: string) =>
    setRecipients((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const save = () =>
    start(async () => {
      const r = await saveDigestAction({
        morningEnabled,
        morningTime,
        eveningEnabled,
        eveningTime,
        skipSundays,
        recipientUserIds: [...recipients],
        extraPhones: phones.filter((p) => p.phone.trim()),
      })
      toast.push({ tone: r.ok ? 'success' : 'error', title: r.ok ? 'Daily summary saved' : 'Could not save', description: r.message })
      if (r.ok) router.refresh()
    })

  const test = (slot: 'morning' | 'evening') =>
    start(async () => {
      const r = await sendTestAction(slot)
      toast.push({ tone: r.ok ? 'success' : 'error', title: r.ok ? 'Test sent' : 'Could not send', description: r.message })
    })

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2">
        <SlotCard
          title="Morning summary"
          hint="Attendance, staff away, cover still needed, approvals waiting."
          enabled={morningEnabled}
          onEnabled={setMorningEnabled}
          time={morningTime}
          onTime={setMorningTime}
          onTest={() => test('morning')}
          pending={pending}
        />
        <SlotCard
          title="Evening summary"
          hint="Fees collected by mode, dues, expenses, early exits, approvals."
          enabled={eveningEnabled}
          onEnabled={setEveningEnabled}
          time={eveningTime}
          onTime={setEveningTime}
          onTest={() => test('evening')}
          pending={pending}
        />
      </section>

      <label className="flex items-center gap-2 text-sm text-ink">
        <Checkbox checked={skipSundays} onChange={(e) => setSkipSundays(e.target.checked)} />
        Don&apos;t send on Sundays (holidays on the school calendar are always skipped in the morning)
      </label>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-ink">Who receives it</h3>
        <p className="text-xs text-ink-subtle">
          Each person gets it in the app and on WhatsApp at the phone number on their login.
        </p>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {users.map((u) => (
            <label
              key={u.id}
              className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-line px-3 py-2 text-sm hover:bg-surface-2"
            >
              <Checkbox checked={recipients.has(u.id)} onChange={() => toggle(u.id)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-ink">{u.name}</span>
                <span className="block truncate text-xs text-ink-subtle">
                  {u.roles || 'Staff'} · {u.phone ?? 'no phone — app only'}
                </span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-ink">Other WhatsApp numbers</h3>
        <p className="text-xs text-ink-subtle">For an owner or trustee who does not log in. WhatsApp only.</p>
        {phones.map((p, i) => (
          <div key={i} className="flex gap-2">
            <Input
              value={p.name}
              placeholder="Name"
              aria-label="Name"
              onChange={(e) => setPhones(phones.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
            />
            <Input
              value={p.phone}
              placeholder="+91 98765 43210"
              aria-label="WhatsApp number"
              inputMode="tel"
              onChange={(e) => setPhones(phones.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)))}
            />
            <Button variant="ghost" size="icon" aria-label="Remove number" onClick={() => setPhones(phones.filter((_, j) => j !== i))}>
              <Trash2 aria-hidden />
            </Button>
          </div>
        ))}
        {phones.length < 10 ? (
          <Button variant="secondary" size="sm" onClick={() => setPhones([...phones, { name: '', phone: '' }])}>
            <Plus aria-hidden /> Add number
          </Button>
        ) : null}
      </section>

      <div className="flex justify-end">
        <Button onClick={save} loading={pending}>
          Save
        </Button>
      </div>
    </div>
  )
}

function SlotCard(props: {
  title: string
  hint: string
  enabled: boolean
  onEnabled: (v: boolean) => void
  time: string
  onTime: (v: string) => void
  onTest: () => void
  pending: boolean
}) {
  return (
    <div className="space-y-3 rounded-[var(--radius)] border border-line p-4">
      <label className="flex items-center gap-2 text-sm font-medium text-ink">
        <Checkbox checked={props.enabled} onChange={(e) => props.onEnabled(e.target.checked)} />
        {props.title}
      </label>
      <p className="text-xs text-ink-subtle">{props.hint}</p>
      <div className="flex items-end gap-2">
        <Field label="Send at" htmlFor={`${props.title.split(' ')[0]!.toLowerCase()}-time`}>
          <Input
            id={`${props.title.split(' ')[0]!.toLowerCase()}-time`}
            type="time"
            value={props.time}
            disabled={!props.enabled}
            onChange={(e) => props.onTime(e.target.value)}
            className="w-32"
          />
        </Field>
        <Button variant="secondary" size="sm" className="mb-0.5" loading={props.pending} onClick={props.onTest}>
          <Send aria-hidden /> Send me a test
        </Button>
      </div>
    </div>
  )
}
