import { describe, expect, it } from 'vitest'
import { computeReadiness, infraCheckPassed, shortfall, type InfraAnswers, type ReadinessItem } from '@/lib/labs/readiness'
import { compositeScience, LAB_TEMPLATES } from '@/lib/labs/templates'
import { LAB_TYPES, PRACTICAL_SUBJECTS } from '@/lib/labs/types'

const today = new Date('2026-11-06T00:00:00.000Z')
const daysAgo = (n: number) => new Date(today.getTime() - n * 86_400_000)

function fullInfra(): InfraAnswers {
  return Object.fromEntries(
    compositeScience.infrastructure.map((c) => [c.code, c.min !== undefined ? { ok: true, value: c.min } : { ok: true }]),
  )
}

function fullItems(): ReadinessItem[] {
  return compositeScience.items.map((t) => ({
    templateCode: t.code,
    name: t.name,
    kind: t.kind,
    quantity: t.required,
    requiredQty: t.required,
    expiresOn: null,
  }))
}

const fresh = { MONTHLY: daysAgo(5), QUARTERLY: daysAgo(30) }

describe.each(LAB_TEMPLATES.map((t) => [t.code, t] as const))('%s template', (_code, template) => {
  it('has unique item, check and practical codes', () => {
    for (const list of [template.items, template.infrastructure, template.practicals]) {
      const codes = list.map((x) => x.code)
      expect(new Set(codes).size).toBe(codes.length)
    }
  })

  it('only refers to items it defines in practical apparatus', () => {
    const codes = new Set(template.items.map((i) => i.code))
    for (const p of template.practicals) for (const a of p.apparatus) expect(codes, `${p.code} → ${a.itemCode}`).toContain(a.itemCode)
  })

  it('uses a known lab type and practical subjects', () => {
    expect(LAB_TYPES.map((t) => t.value)).toContain(template.labType)
    for (const p of template.practicals) expect(PRACTICAL_SUBJECTS).toContain(p.subject)
  })

  it('defines all three inspection schedules', () => {
    expect(template.inspections.map((s) => s.type).sort()).toEqual(['DAILY', 'MONTHLY', 'QUARTERLY'])
  })

  it('scores 100 when fully equipped and inspected', () => {
    const infrastructure: InfraAnswers = Object.fromEntries(
      template.infrastructure.map((c) => [c.code, c.min !== undefined ? { ok: true, value: c.min } : { ok: true }]),
    )
    const items: ReadinessItem[] = template.items.map((t) => ({
      templateCode: t.code, name: t.name, kind: t.kind, quantity: t.required, requiredQty: t.required, expiresOn: null,
    }))
    expect(computeReadiness({ template, infrastructure, items, lastInspection: fresh, openSeriousIncidents: 0, today }).score).toBe(100)
  })
})

describe('computeReadiness', () => {
  it('scores a fully equipped, inspected lab at 100', () => {
    const r = computeReadiness({ template: compositeScience, infrastructure: fullInfra(), items: fullItems(), lastInspection: fresh, openSeriousIncidents: 0, today })
    expect(r.score).toBe(100)
    expect(r.band).toBe('ready')
    expect(r.sections.every((s) => s.gaps.length === 0)).toBe(true)
  })

  it('scores an empty lab as not ready and lists every gap', () => {
    const r = computeReadiness({ template: compositeScience, infrastructure: {}, items: [], lastInspection: {}, openSeriousIncidents: 0, today })
    expect(r.score).toBe(0)
    expect(r.band).toBe('not-ready')
    expect(r.sections.find((s) => s.key === 'infrastructure')!.gaps).toHaveLength(compositeScience.infrastructure.length)
    expect(r.sections.find((s) => s.key === 'safety')!.gaps.some((g) => g.includes('monthly') || g.includes('Monthly'))).toBe(true)
  })

  it('treats an overdue quarterly inspection as a safety gap after the grace period', () => {
    const onTime = computeReadiness({ template: compositeScience, infrastructure: fullInfra(), items: fullItems(), lastInspection: { MONTHLY: daysAgo(5), QUARTERLY: daysAgo(95) }, openSeriousIncidents: 0, today })
    expect(onTime.score).toBe(100)
    const late = computeReadiness({ template: compositeScience, infrastructure: fullInfra(), items: fullItems(), lastInspection: { MONTHLY: daysAgo(5), QUARTERLY: daysAgo(98) }, openSeriousIncidents: 0, today })
    expect(late.score).toBe(94) // safety weight 20 × 0.3 lost
    expect(late.sections.find((s) => s.key === 'safety')!.gaps[0]).toMatch(/overdue/)
  })

  it('halves the safety score while a serious incident is open', () => {
    const r = computeReadiness({ template: compositeScience, infrastructure: fullInfra(), items: fullItems(), lastInspection: fresh, openSeriousIncidents: 1, today })
    expect(r.score).toBe(90)
    expect(r.band).toBe('ready')
  })

  it('does not count expired consumables as stock', () => {
    const items = fullItems().map((i) => (i.kind === 'CONSUMABLE' ? { ...i, expiresOn: daysAgo(1) } : i))
    const r = computeReadiness({ template: compositeScience, infrastructure: fullInfra(), items, lastInspection: fresh, openSeriousIncidents: 0, today })
    expect(r.sections.find((s) => s.key === 'consumables')!.score).toBe(0)
  })

  it('gives partial credit for partial stock', () => {
    const items = fullItems().map((i) => ({ ...i, quantity: i.requiredQty / 2 }))
    const r = computeReadiness({ template: compositeScience, infrastructure: fullInfra(), items, lastInspection: fresh, openSeriousIncidents: 0, today })
    expect(r.sections.find((s) => s.key === 'equipment')!.score).toBeCloseTo(0.5)
  })
})

describe('helpers', () => {
  it('checks minimum counts and yes/no answers', () => {
    expect(infraCheckPassed({ min: 40 }, { ok: true, value: 39 })).toBe(false)
    expect(infraCheckPassed({ min: 40 }, { ok: true, value: 40 })).toBe(true)
    expect(infraCheckPassed({}, { ok: false })).toBe(false)
    expect(infraCheckPassed({}, undefined)).toBe(false)
  })

  it('never reports a negative shortfall', () => {
    expect(shortfall(10, 4)).toBe(6)
    expect(shortfall(10, 12)).toBe(0)
    expect(shortfall(0.5, 0.2)).toBe(0.3)
  })
})
