'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { setGradingScalePassRuleAction } from '../actions'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { PASS_RULE_LABELS, type PassRule } from './grade-scale-form'

/**
 * Pass / fail rule of a scale. Editable even when results are published —
 * saving recalculates every exam on this scale that already has results.
 */
export function PassRuleControl({ id, passRule, passPercent, examCount }: { id: string; passRule: PassRule; passPercent: number; examCount: number }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = React.useTransition()
  const [rule, setRule] = React.useState<PassRule>(passRule)
  const [percent, setPercent] = React.useState(String(passPercent))
  const dirty = rule !== passRule || (rule === 'OVERALL' && Number(percent) !== passPercent)

  const save = () => {
    if (examCount > 0 && !window.confirm('Results of every exam on this scale will be recalculated, including published report cards. Continue?')) return
    startTransition(async () => {
      const result = await setGradingScalePassRuleAction(id, { passRule: rule, passPercent: percent === '' ? 33 : percent })
      toast.push({ tone: result.ok ? 'success' : 'error', title: result.ok ? 'Pass rule updated' : 'Could not update the pass rule', description: result.message })
      if (result.ok) router.refresh()
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2.5 text-sm">
      <span className="text-ink-muted">Pass rule</span>
      <Select aria-label="Pass rule" value={rule} onChange={(e) => setRule(e.target.value as PassRule)} className="h-8 w-auto">
        {(Object.keys(PASS_RULE_LABELS) as PassRule[]).map((key) => (
          <option key={key} value={key}>{PASS_RULE_LABELS[key]}</option>
        ))}
      </Select>
      {rule === 'OVERALL' ? (
        <label className="flex items-center gap-1.5 text-ink-muted">
          at least
          <Input aria-label="Pass percentage" type="number" min={0} max={100} step="0.01" value={percent} onChange={(e) => setPercent(e.target.value)} className="h-8 w-20 text-right tnum" />
          %
        </label>
      ) : null}
      {dirty ? (
        <Button size="sm" loading={pending} onClick={save}>
          Save{examCount > 0 ? ' & recalculate' : ''}
        </Button>
      ) : null}
    </div>
  )
}
