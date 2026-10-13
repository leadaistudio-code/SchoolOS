'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, KeyRound, Search, ShieldAlert, UserRound, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Field, Input } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import {
  cancelGatePassAction,
  createGatePassAction,
  pickupCandidatesAction,
  resendOtpAction,
  searchStudentsAction,
  verifyOtpAction,
} from './actions'

type Hit = { id: string; name: string; admissionNo: string; className: string }
type Candidates = Extract<Awaited<ReturnType<typeof pickupCandidatesAction>>, { ok: true }>['student']

const REASONS = ['Feeling unwell', 'Family function', 'Doctor appointment', 'Early pickup requested by parent']

export function IssueGatePassForm() {
  const router = useRouter()
  const toast = useToast()
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [searched, setSearched] = useState('')
  const [student, setStudent] = useState<Candidates | null>(null)
  const [guardianId, setGuardianId] = useState<string | 'other' | null>(null)
  const [other, setOther] = useState({ name: '', relation: '', phone: '' })
  const [reason, setReason] = useState('')
  const [useOtp, setUseOtp] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  useEffect(() => {
    if (student || q.trim().length < 2) {
      setHits([])
      return
    }
    const t = setTimeout(() => {
      searchStudentsAction(q)
        .then(setHits)
        .catch(() => setHits([]))
        .finally(() => setSearched(q))
    }, 250)
    return () => clearTimeout(t)
  }, [q, student])

  function pick(hit: Hit) {
    setError(null)
    start(async () => {
      const r = await pickupCandidatesAction(hit.id)
      if (!r.ok) {
        setError(r.message)
        return
      }
      setStudent(r.student)
      setHits([])
      const first = r.student.guardians.find((g) => g.canPickup)
      setGuardianId(first?.id ?? null)
    })
  }

  function reset() {
    setStudent(null)
    setQ('')
    setGuardianId(null)
    setOther({ name: '', relation: '', phone: '' })
    setReason('')
    setUseOtp(false)
    setError(null)
  }

  const chosen = student?.guardians.find((g) => g.id === guardianId)
  const mustOtp = guardianId === 'other' || (chosen ? !chosen.canPickup : false)
  const otp = mustOtp || useOtp

  function submit() {
    if (!student) return
    setError(null)
    start(async () => {
      const r = await createGatePassAction({
        studentId: student.id,
        reason,
        guardianId: guardianId && guardianId !== 'other' ? guardianId : undefined,
        pickupName: guardianId === 'other' ? other.name : undefined,
        pickupRelation: guardianId === 'other' ? other.relation : undefined,
        pickupPhone: guardianId === 'other' ? other.phone : undefined,
        verification: otp ? 'OTP' : 'IN_PERSON',
      })
      if (!r.ok) {
        setError(r.message)
        return
      }
      toast.push({ tone: 'success', title: r.awaitingOtp ? 'Approval code sent' : 'Pass issued', description: r.message })
      reset()
      router.push(`/front-office/gate-passes/${r.id}`)
    })
  }

  if (!student) {
    return (
      <div className="space-y-3">
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Field label="Student" htmlFor="gp-search" hint="Name or admission number">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
            <Input id="gp-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="pl-8" autoComplete="off" />
          </div>
        </Field>
        {hits.length > 0 ? (
          <ul className="divide-y divide-line rounded-[var(--radius-sm)] border border-line">
            {hits.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  onClick={() => pick(h)}
                  disabled={pending}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-bg"
                >
                  <span className="font-medium text-ink">{h.name}</span>
                  <span className="text-xs text-ink-subtle">
                    {h.className} · {h.admissionNo}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : q.trim().length >= 2 && searched === q ? (
          <p className="text-xs text-ink-subtle">No matching current students.</p>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div className="flex items-start justify-between gap-2 rounded-[var(--radius-sm)] border border-line p-3">
        <div>
          <p className="text-sm font-semibold text-ink">{student.name}</p>
          <p className="text-xs text-ink-subtle">
            {student.className} · {student.admissionNo}
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={reset} aria-label="Choose another student">
          <X className="size-4" aria-hidden />
        </Button>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium text-ink">Who is collecting?</legend>
        {student.guardians.length === 0 ? (
          <p className="text-xs text-ink-subtle">No guardians on record for this student.</p>
        ) : null}
        {student.guardians.map((g) => (
          <label
            key={g.id}
            className={cn(
              'flex cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] border p-2.5 text-sm',
              guardianId === g.id ? 'border-brand bg-brand/5' : 'border-line',
            )}
          >
            <input type="radio" name="gp-guardian" checked={guardianId === g.id} onChange={() => setGuardianId(g.id)} className="accent-[var(--color-brand)]" />
            {g.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={g.photoUrl} alt="" className="size-9 rounded-full object-cover" />
            ) : (
              <span className="grid size-9 place-items-center rounded-full bg-bg">
                <UserRound className="size-4 text-ink-subtle" aria-hidden />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-ink">{g.name}</span>
              <span className="block text-xs text-ink-subtle">
                {g.relation.charAt(0) + g.relation.slice(1).toLowerCase()}
                {g.phone ? ` · ${g.phone}` : ''}
              </span>
            </span>
            {g.canPickup ? <Badge tone="success">Can pick up</Badge> : <Badge tone="warning">Not on pickup list</Badge>}
          </label>
        ))}
        <label
          className={cn(
            'flex cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] border p-2.5 text-sm',
            guardianId === 'other' ? 'border-brand bg-brand/5' : 'border-line',
          )}
        >
          <input type="radio" name="gp-guardian" checked={guardianId === 'other'} onChange={() => setGuardianId('other')} className="accent-[var(--color-brand)]" />
          <span className="font-medium text-ink">Someone else (driver, relative…)</span>
        </label>
        {guardianId === 'other' ? (
          <div className="grid gap-2 sm:grid-cols-3">
            <Input aria-label="Name" placeholder="Full name" value={other.name} onChange={(e) => setOther({ ...other, name: e.target.value })} />
            <Input aria-label="Relation" placeholder="Relation" value={other.relation} onChange={(e) => setOther({ ...other, relation: e.target.value })} />
            <Input aria-label="Phone" placeholder="Phone" value={other.phone} onChange={(e) => setOther({ ...other, phone: e.target.value })} />
          </div>
        ) : null}
      </fieldset>

      <Field label="Reason" htmlFor="gp-reason">
        <Input id="gp-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is the student leaving early?" />
      </Field>
      <div className="flex flex-wrap gap-1.5">
        {REASONS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setReason(r)}
            className="rounded-full border border-line px-2.5 py-1 text-xs text-ink-muted hover:border-brand hover:text-ink"
          >
            {r}
          </button>
        ))}
      </div>

      {mustOtp ? (
        <Notice tone="warning">
          This person is not on the pickup list. A one-time code will go to the parent’s phone; the student can leave only after the
          collector reads it back to you.
        </Notice>
      ) : (
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={useOtp} onChange={(e) => setUseOtp(e.target.checked)} className="accent-[var(--color-brand)]" />
          Also confirm with a code sent to the parent’s phone
        </label>
      )}

      <Button block onClick={submit} loading={pending} disabled={!guardianId || reason.trim().length < 2}>
        {otp ? (
          <>
            <KeyRound className="size-4" aria-hidden /> Send approval code
          </>
        ) : (
          <>
            <Check className="size-4" aria-hidden /> Issue pass
          </>
        )}
      </Button>
      {!student.hasContact ? (
        <p className="flex items-center gap-1.5 text-xs text-warning">
          <ShieldAlert className="size-3.5" aria-hidden /> No parent phone on file. Parents will not get the exit alert.
        </p>
      ) : null}
    </div>
  )
}

export function OtpPanel({ id, sentTo }: { id: string; sentTo: string | null }) {
  const router = useRouter()
  const toast = useToast()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function verify() {
    setError(null)
    start(async () => {
      const r = await verifyOtpAction(id, code)
      if (!r.ok) {
        setError(r.message)
        return
      }
      toast.push({ tone: 'success', title: 'Approved', description: r.message })
      router.refresh()
    })
  }

  function resend() {
    setError(null)
    start(async () => {
      const r = await resendOtpAction(id)
      toast.push({ tone: r.ok ? 'success' : 'error', title: r.ok ? 'Code resent' : 'Could not resend', description: r.message })
    })
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-muted">
        A 6-digit code was sent to the parent{sentTo ? ` at ${sentTo}` : ''}. Ask the collector to read it out.
      </p>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div className="flex gap-2">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          placeholder="••••••"
          aria-label="Approval code"
          className="max-w-40 text-center font-mono text-lg tracking-[0.4em]"
          onKeyDown={(e) => e.key === 'Enter' && code.length === 6 && verify()}
        />
        <Button onClick={verify} loading={pending} disabled={code.length !== 6}>
          Verify
        </Button>
        <Button variant="ghost" onClick={resend} disabled={pending}>
          Resend
        </Button>
      </div>
    </div>
  )
}

export function CancelPassButton({ id }: { id: string }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = useTransition()
  return (
    <Button
      variant="ghost"
      size="sm"
      loading={pending}
      onClick={() => {
        const reason = window.prompt('Why cancel this pass?')
        if (reason === null) return
        start(async () => {
          const r = await cancelGatePassAction(id, reason)
          toast.push({ tone: r.ok ? 'success' : 'error', title: r.ok ? 'Cancelled' : 'Could not cancel', description: r.message })
          if (r.ok) router.refresh()
        })
      }}
    >
      Cancel pass
    </Button>
  )
}
