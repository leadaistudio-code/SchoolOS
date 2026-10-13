'use client'

import { useRef, useState, useTransition } from 'react'
import { Camera, CheckCircle2, LogOut, OctagonX, Search, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'
import { BarcodeCameraScanner } from '@/components/exams/barcode-camera-scanner'
import { cn } from '@/lib/utils'
import { lookupPassAction, markExitedAction } from '../gate-passes/actions'

type Pass = Extract<Awaited<ReturnType<typeof lookupPassAction>>, { ok: true }>['pass']

function verdict(p: Pass): { go: boolean; text: string } {
  if (p.status === 'CANCELLED') return { go: false, text: 'Pass cancelled. Do not let the student leave.' }
  if (p.status === 'EXITED') return { go: false, text: 'This pass has already been used.' }
  if (p.status === 'AWAITING_OTP') return { go: false, text: 'The parent has not approved yet. Send them back to the desk.' }
  if (!p.issuedToday) return { go: false, text: 'This pass was for another day.' }
  return { go: true, text: 'Approved. Check the faces match, then let them out.' }
}

export function GateScanner() {
  const toast = useToast()
  const [code, setCode] = useState('')
  const [camera, setCamera] = useState(false)
  const [pass, setPass] = useState<Pass | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  function lookup(value: string) {
    const v = value.trim()
    if (!v) return
    setError(null)
    setPass(null)
    start(async () => {
      const r = await lookupPassAction(v)
      if (r.ok) setPass(r.pass)
      else setError(r.message)
    })
  }

  function letOut() {
    if (!pass) return
    start(async () => {
      const r = await markExitedAction(pass.id)
      toast.push({ tone: r.ok ? 'success' : 'error', title: r.ok ? 'Student scanned out' : 'Could not scan out', description: r.message })
      if (r.ok) {
        setPass(null)
        setCode('')
        inputRef.current?.focus()
      }
    })
  }

  const v = pass ? verdict(pass) : null

  return (
    <div className="space-y-4">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          lookup(code)
        }}
      >
        <Input
          ref={inputRef}
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Scan the QR or type the pass number (GP-…)"
          aria-label="Pass code"
          className="h-11 font-mono"
        />
        <Button type="submit" size="lg" loading={pending && !pass}>
          <Search className="size-4" aria-hidden /> Check
        </Button>
        <Button type="button" variant="secondary" size="lg" onClick={() => setCamera(true)}>
          <Camera className="size-4" aria-hidden /> Camera
        </Button>
      </form>

      {error ? <Notice tone="danger">{error}</Notice> : null}

      {pass && v ? (
        <div className={cn('rounded-[var(--radius-md)] border-2 p-5', v.go ? 'border-success bg-success-bg' : 'border-danger bg-danger-bg')}>
          <div className="mb-4 flex items-center gap-2">
            {v.go ? <CheckCircle2 className="size-6 text-success" aria-hidden /> : <OctagonX className="size-6 text-danger" aria-hidden />}
            <p className={cn('text-base font-semibold', v.go ? 'text-success' : 'text-danger')}>{v.text}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Person label="Student" name={pass.student} sub={`${pass.className || '—'} · ${pass.admissionNo}`} photo={pass.studentPhoto} />
            <Person
              label="Collected by"
              name={pass.pickupName}
              sub={`${pass.pickupRelation ?? ''}${pass.verification === 'OTP' ? ' · parent approved by code' : ''}`}
              photo={pass.pickupPhoto}
            />
          </div>
          <p className="mt-3 text-sm text-ink-muted">
            <Badge tone="neutral">{pass.passNumber}</Badge> <span className="ml-1">{pass.reason}</span>
          </p>
          {v.go ? (
            <Button className="mt-4" size="lg" block onClick={letOut} loading={pending}>
              <LogOut className="size-4" aria-hidden /> Let out and tell parents
            </Button>
          ) : null}
        </div>
      ) : null}

      <BarcodeCameraScanner
        open={camera}
        onClose={() => setCamera(false)}
        onDetected={(value) => {
          setCamera(false)
          setCode(value)
          lookup(value)
        }}
        title="Scan gate pass"
        description="Point the camera at the QR code on the gate pass."
      />
    </div>
  )
}

function Person({ label, name, sub, photo }: { label: string; name: string; sub: string; photo: string | null }) {
  return (
    <div className="flex items-center gap-3">
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" className="size-16 rounded-full border border-line object-cover" />
      ) : (
        <span className="grid size-16 place-items-center rounded-full border border-line bg-surface">
          <UserRound className="size-6 text-ink-subtle" aria-hidden />
        </span>
      )}
      <div>
        <p className="text-xs uppercase tracking-wider text-ink-subtle">{label}</p>
        <p className="text-lg font-semibold text-ink">{name}</p>
        <p className="text-sm text-ink-muted">{sub}</p>
      </div>
    </div>
  )
}
