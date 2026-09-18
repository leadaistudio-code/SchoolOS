'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { copyFeePlanAction } from '../../../actions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { formatMoney } from '@/lib/utils'

export function CopyFeePlanForm({
  structureId, sourceName, currentMinor, studentCount, currency, sessions,
}: {
  structureId: string
  sourceName: string
  currentMinor: number
  studentCount: number
  currency: string
  sessions: { id: string; name: string }[]
}) {
  const router = useRouter()
  const toast = useToast()
  const [targetSessionId, setTargetSessionId] = React.useState(sessions[0]?.id ?? '')
  const [name, setName] = React.useState(sourceName)
  const [increaseKind, setIncreaseKind] = React.useState<'NONE' | 'PERCENT' | 'FIXED'>('NONE')
  const [increaseValue, setIncreaseValue] = React.useState('0')
  const [pending, startTransition] = React.useTransition()
  const value = Number(increaseValue || 0)
  const proposedMinor = increaseKind === 'PERCENT'
    ? currentMinor + Math.round(currentMinor * value / 100)
    : increaseKind === 'FIXED'
      ? currentMinor + Math.round(value * 100)
      : currentMinor
  const difference = (proposedMinor - currentMinor) * studentCount

  const copy = () => startTransition(async () => {
    const result = await copyFeePlanAction({ structureId, targetSessionId, name, increaseKind, increaseValue: value })
    if (!result.ok) {
      toast.push({ tone: 'error', title: 'Structure not copied', description: result.message })
      return
    }
    toast.push({ tone: 'success', title: 'Draft created', description: result.message })
    router.push('/finance/structures')
    router.refresh()
  })

  return (
    <Card className="max-w-3xl">
      <CardHeader><CardTitle>New session plan</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Target academic session" htmlFor="copy-session" required><Select id="copy-session" value={targetSessionId} onChange={(event) => setTargetSessionId(event.target.value)}>{sessions.map((session) => <option key={session.id} value={session.id}>{session.name}</option>)}</Select></Field>
          <Field label="New structure name" htmlFor="copy-name" required><Input id="copy-name" value={name} onChange={(event) => setName(event.target.value)} /></Field>
          <Field label="Fee change" htmlFor="copy-kind"><Select id="copy-kind" value={increaseKind} onChange={(event) => setIncreaseKind(event.target.value as typeof increaseKind)}><option value="NONE">Keep same fees</option><option value="PERCENT">Increase by percentage</option><option value="FIXED">Increase by fixed annual amount</option></Select></Field>
          {increaseKind !== 'NONE' ? <Field label={increaseKind === 'PERCENT' ? 'Increase %' : 'Increase ₹ per student'} htmlFor="copy-value"><Input id="copy-value" type="number" min={0} value={increaseValue} onChange={(event) => setIncreaseValue(event.target.value)} /></Field> : null}
        </div>
        <div className="grid gap-3 rounded-[var(--radius-sm)] bg-surface-2 p-3 sm:grid-cols-2 lg:grid-cols-4">
          <div><p className="text-xs text-ink-muted">Current annual fee</p><p className="font-medium tnum">{formatMoney(currentMinor, currency)}</p></div>
          <div><p className="text-xs text-ink-muted">Proposed annual fee</p><p className="font-medium tnum">{formatMoney(proposedMinor, currency)}</p></div>
          <div><p className="text-xs text-ink-muted">Assigned students</p><p className="font-medium tnum">{studentCount}</p></div>
          <div><p className="text-xs text-ink-muted">Estimated billing impact</p><p className="font-semibold tnum text-success">+{formatMoney(difference, currency)}</p></div>
        </div>
        <p className="text-xs text-ink-muted">Estimated billing impact is a planning estimate, not guaranteed collected revenue.</p>
        <Button disabled={!targetSessionId || !name.trim()} loading={pending} onClick={copy}>Create draft copy</Button>
      </CardContent>
    </Card>
  )
}
