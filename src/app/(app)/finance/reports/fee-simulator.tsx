'use client'

import * as React from 'react'
import { simulateFeeIncreaseAction } from '../actions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { formatMoney } from '@/lib/utils'

type Result = {
  currentAnnualMinor: number
  proposedAnnualMinor: number
  increasePerStudentMinor: number
  students: number
  estimatedBillingDifferenceMinor: number
}

export function FeeSimulator({
  structures, currency,
}: {
  structures: { id: string; name: string }[]
  currency: string
}) {
  const toast = useToast()
  const [structureId, setStructureId] = React.useState(structures[0]?.id ?? '')
  const [kind, setKind] = React.useState<'PERCENT' | 'FIXED'>('PERCENT')
  const [value, setValue] = React.useState('5')
  const [result, setResult] = React.useState<Result | null>(null)
  const [pending, startTransition] = React.useTransition()
  if (!structures.length) return null

  const calculate = () => startTransition(async () => {
    const response = await simulateFeeIncreaseAction({ structureId, kind, value: Number(value) })
    if (!response.ok) {
      toast.push({ tone: 'error', title: 'Estimate unavailable', description: response.message })
      return
    }
    setResult(response.data as Result)
  })

  return (
    <Card>
      <CardHeader>
        <div><CardTitle>Fee increase simulator</CardTitle><p className="mt-0.5 text-sm text-ink-muted">Planning estimate—not guaranteed revenue</p></div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1.5fr_1fr_1fr_auto] sm:items-end">
          <Field label="Fee structure" htmlFor="sim-structure"><Select id="sim-structure" value={structureId} onChange={(event) => setStructureId(event.target.value)}>{structures.map((structure) => <option key={structure.id} value={structure.id}>{structure.name}</option>)}</Select></Field>
          <Field label="Increase type" htmlFor="sim-kind"><Select id="sim-kind" value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}><option value="PERCENT">Percentage</option><option value="FIXED">Fixed annual amount</option></Select></Field>
          <Field label={kind === 'PERCENT' ? 'Increase %' : 'Increase ₹'} htmlFor="sim-value"><Input id="sim-value" type="number" min={0} value={value} onChange={(event) => setValue(event.target.value)} /></Field>
          <Button onClick={calculate} loading={pending}>Calculate</Button>
        </div>
        {result ? (
          <div className="grid gap-3 rounded-[var(--radius-sm)] bg-surface-2 p-3 sm:grid-cols-2 lg:grid-cols-5">
            <div><p className="text-xs text-ink-muted">Current annual fee</p><p className="font-medium tnum">{formatMoney(result.currentAnnualMinor, currency)}</p></div>
            <div><p className="text-xs text-ink-muted">Proposed annual fee</p><p className="font-medium tnum">{formatMoney(result.proposedAnnualMinor, currency)}</p></div>
            <div><p className="text-xs text-ink-muted">Increase per student</p><p className="font-medium tnum">{formatMoney(result.increasePerStudentMinor, currency)}</p></div>
            <div><p className="text-xs text-ink-muted">Assigned students</p><p className="font-medium tnum">{result.students}</p></div>
            <div><p className="text-xs text-ink-muted">Estimated billing impact</p><p className="font-semibold tnum text-success">+{formatMoney(result.estimatedBillingDifferenceMinor, currency)}</p></div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
