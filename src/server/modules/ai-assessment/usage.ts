import type { AppContext } from '@/server/context'
import { assertWithinLimit, FEATURE, limitFor } from '@/server/entitlements'
import { prisma } from '@/server/db/prisma'

export const AI_USAGE_KIND = {
  EVAL_PAGES: 'evaluation.pages',
  GENERATE: 'question.generate',
} as const

function monthStart(): Date {
  const since = new Date()
  since.setDate(1)
  since.setHours(0, 0, 0, 0)
  return since
}

/** Sum of AiUsageEvent.units for a kind in the current calendar month. */
export async function aiUsageUnitsThisMonth(
  tenantId: string,
  kind: string,
): Promise<number> {
  const agg = await prisma.aiUsageEvent.aggregate({
    where: { tenantId, kind, createdAt: { gte: monthStart() } },
    _sum: { units: true },
  })
  return agg._sum.units ?? 0
}

export async function assertAiEvalPagesQuota(tenantId: string, pagesToAdd: number) {
  if (pagesToAdd <= 0) return
  const current = await aiUsageUnitsThisMonth(tenantId, AI_USAGE_KIND.EVAL_PAGES)
  await assertWithinLimit(tenantId, FEATURE.LIMIT_AI_EVAL_PAGES_PER_MONTH, current, pagesToAdd)
}

export async function assertAiGenerateQuota(tenantId: string, questionsToAdd: number) {
  if (questionsToAdd <= 0) return
  const current = await aiUsageUnitsThisMonth(tenantId, AI_USAGE_KIND.GENERATE)
  await assertWithinLimit(tenantId, FEATURE.LIMIT_AI_GENERATE_PER_MONTH, current, questionsToAdd)
}

/**
 * School AI usage dashboard — month-to-date by kind, daily series, plan limits.
 */
export async function schoolAiUsageDashboard(ctx: AppContext) {
  ctx.require('assessments.view')

  const since = monthStart()
  const [events, evalLimit, generateLimit] = await Promise.all([
    ctx.db.aiUsageEvent.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        kind: true,
        units: true,
        model: true,
        createdAt: true,
        meta: true,
      },
    }),
    limitFor(ctx.tenant.id, FEATURE.LIMIT_AI_EVAL_PAGES_PER_MONTH),
    limitFor(ctx.tenant.id, FEATURE.LIMIT_AI_GENERATE_PER_MONTH),
  ])

  const byKind = new Map<string, { units: number; events: number }>()
  const byDay = new Map<string, { evaluationPages: number; generate: number }>()

  for (const event of events) {
    const kindEntry = byKind.get(event.kind) ?? { units: 0, events: 0 }
    kindEntry.units += event.units
    kindEntry.events += 1
    byKind.set(event.kind, kindEntry)

    const day = event.createdAt.toISOString().slice(0, 10)
    const dayEntry = byDay.get(day) ?? { evaluationPages: 0, generate: 0 }
    if (event.kind === AI_USAGE_KIND.EVAL_PAGES) dayEntry.evaluationPages += event.units
    if (event.kind === AI_USAGE_KIND.GENERATE) dayEntry.generate += event.units
    byDay.set(day, dayEntry)
  }

  const evaluationPages = byKind.get(AI_USAGE_KIND.EVAL_PAGES)?.units ?? 0
  const generateUnits = byKind.get(AI_USAGE_KIND.GENERATE)?.units ?? 0

  return {
    periodStart: since.toISOString(),
    evaluationPages,
    generateUnits,
    evaluationLimit: evalLimit,
    generateLimit,
    evaluationRemaining:
      evalLimit == null ? null : Math.max(0, evalLimit - evaluationPages),
    generateRemaining:
      generateLimit == null ? null : Math.max(0, generateLimit - generateUnits),
    byKind: [...byKind.entries()].map(([kind, row]) => ({ kind, ...row })),
    byDay: [...byDay.entries()]
      .map(([day, row]) => ({ day, ...row }))
      .sort((a, b) => a.day.localeCompare(b.day)),
    recent: events
      .slice()
      .reverse()
      .slice(0, 25)
      .map((e) => ({
        id: e.id,
        kind: e.kind,
        units: e.units,
        model: e.model,
        createdAt: e.createdAt.toISOString(),
      })),
  }
}
