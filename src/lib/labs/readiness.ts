import type { InspectionTypeValue, LabTemplate } from './types'

/**
 * Readiness score for one lab: how close the room, the register and the
 * safety records are to what the template requires. Pure, so the dashboard,
 * the printed report and the tests all agree.
 */

export type InfraAnswers = Record<string, { ok: boolean; value?: number; note?: string }>

export type ReadinessItem = {
  templateCode: string | null
  name: string
  kind: 'NON_CONSUMABLE' | 'CONSUMABLE'
  quantity: number
  requiredQty: number
  expiresOn: Date | null
}

export type ReadinessInput = {
  template: LabTemplate
  infrastructure: InfraAnswers
  items: ReadinessItem[]
  lastInspection: Partial<Record<InspectionTypeValue, Date>>
  openSeriousIncidents: number
  today: Date
}

export type ReadinessSection = {
  key: 'infrastructure' | 'equipment' | 'consumables' | 'safety'
  label: string
  weight: number
  /** 0..1 */
  score: number
  gaps: string[]
}

export type Readiness = {
  /** 0..100 */
  score: number
  band: 'ready' | 'nearly' | 'not-ready'
  sections: ReadinessSection[]
}

const DAY = 86_400_000
/** Days of grace after an inspection falls due before it counts as overdue. */
const INSPECTION_GRACE_DAYS = 7

export function infraCheckPassed(
  check: { min?: number },
  answer: { ok: boolean; value?: number } | undefined,
): boolean {
  if (!answer) return false
  if (check.min !== undefined) return (answer.value ?? 0) >= check.min
  return answer.ok
}

function fmt(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '')
}

export function isExpired(expiresOn: Date | null, today: Date) {
  return !!expiresOn && expiresOn.getTime() < today.getTime()
}

export function computeReadiness(input: ReadinessInput): Readiness {
  const { template, infrastructure, items, lastInspection, today } = input

  // Infrastructure
  const infraGaps: string[] = []
  let infraPassed = 0
  for (const check of template.infrastructure) {
    const answer = infrastructure[check.code]
    if (infraCheckPassed(check, answer)) infraPassed++
    else if (check.min !== undefined) {
      infraGaps.push(`${check.label}: ${fmt(answer?.value ?? 0)} of ${check.min} ${check.unit ?? ''}`.trim())
    } else infraGaps.push(check.label)
  }
  const infraScore = template.infrastructure.length ? infraPassed / template.infrastructure.length : 1

  // Register: total held per template code across the lab's items.
  const held = new Map<string, number>()
  for (const item of items) {
    if (!item.templateCode) continue
    const usable = item.kind === 'CONSUMABLE' && isExpired(item.expiresOn, today) ? 0 : item.quantity
    held.set(item.templateCode, (held.get(item.templateCode) ?? 0) + Math.max(0, usable))
  }

  function coverage(filter: (sop: string) => boolean) {
    const gaps: string[] = []
    let sum = 0
    let count = 0
    for (const t of template.items) {
      if (!filter(t.sopList) || t.required <= 0) continue
      const have = held.get(t.code) ?? 0
      count++
      sum += Math.min(1, have / t.required)
      if (have < t.required) gaps.push(`${t.name}: ${fmt(have)} of ${fmt(t.required)} ${t.unit}`)
    }
    return { score: count ? sum / count : 1, gaps }
  }

  const equipment = coverage((s) => s === 'NON_CONSUMABLE' || s === 'SPECIMEN' || s === 'SLIDE')
  const consumables = coverage((s) => s === 'CONSUMABLE')
  const safetyItems = coverage((s) => s === 'SAFETY')

  // Safety records
  const safetyGaps = [...safetyItems.gaps]
  const current = (type: InspectionTypeValue) => {
    const spec = template.inspections.find((i) => i.type === type)
    if (!spec) return 1
    const last = lastInspection[type]
    if (!last) {
      safetyGaps.push(`No ${spec.label.toLowerCase()} recorded`)
      return 0
    }
    const ageDays = (today.getTime() - last.getTime()) / DAY
    if (ageDays > spec.everyDays + INSPECTION_GRACE_DAYS) {
      safetyGaps.push(`${spec.label} overdue (last ${Math.floor(ageDays)} days ago)`)
      return 0
    }
    return 1
  }
  let safetyScore = 0.4 * safetyItems.score + 0.3 * current('MONTHLY') + 0.3 * current('QUARTERLY')
  if (input.openSeriousIncidents > 0) {
    safetyScore *= 0.5
    safetyGaps.push(`${input.openSeriousIncidents} serious incident(s) still open`)
  }

  const sections: ReadinessSection[] = [
    { key: 'infrastructure', label: 'Room & infrastructure', weight: 35, score: infraScore, gaps: infraGaps },
    { key: 'equipment', label: template.sectionLabels?.equipment ?? 'Apparatus, specimens & slides', weight: 30, score: equipment.score, gaps: equipment.gaps },
    { key: 'consumables', label: template.sectionLabels?.consumables ?? 'Chemicals & consumables', weight: 15, score: consumables.score, gaps: consumables.gaps },
    { key: 'safety', label: 'Safety equipment & inspections', weight: 20, score: safetyScore, gaps: safetyGaps },
  ]
  const score = Math.round(sections.reduce((sum, s) => sum + s.weight * s.score, 0))
  return { score, band: score >= 90 ? 'ready' : score >= 70 ? 'nearly' : 'not-ready', sections }
}

/** Shortfall against the template for one register row. */
export function shortfall(requiredQty: number, quantity: number) {
  return Math.max(0, Math.round((requiredQty - quantity) * 1000) / 1000)
}
