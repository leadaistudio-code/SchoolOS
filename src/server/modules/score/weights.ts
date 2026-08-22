import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { hasFeature, FEATURE } from '@/server/entitlements'
import {
  metricsFor,
  resolveWeights,
  type ScorePopulation,
  type WeightSetting,
} from '@/lib/score'

/**
 * Weight storage.
 *
 * Only overrides are persisted. A school that has never opened the editor has
 * no rows at all and is scored on the shipped defaults, which means a metric
 * added in a later release starts counting for everyone rather than sitting at
 * zero until each school notices it exists.
 */

/** Which module-gated metrics this school may use. */
export async function enabledScoreModules(ctx: AppContext) {
  const [transport, library] = await Promise.all([
    hasFeature(ctx.tenant.id, FEATURE.MODULE_TRANSPORT),
    hasFeature(ctx.tenant.id, FEATURE.MODULE_LIBRARY),
  ])
  return { transport, library }
}

/**
 * The weights a score will actually be computed with.
 *
 * Always goes through `resolveWeights`, so the editor and the scorer can never
 * disagree: there is one place that decides what an absent row means.
 */
export async function getWeights(
  ctx: AppContext,
  population: ScorePopulation,
): Promise<WeightSetting[]> {
  const [stored, modules] = await Promise.all([
    ctx.db.scoreWeight.findMany({
      where: { population },
      select: { metric: true, weight: true, isEnabled: true },
    }),
    enabledScoreModules(ctx),
  ])

  return resolveWeights(population, stored, modules)
}

/**
 * Replaces the weights for one population.
 *
 * Written as an upsert per metric rather than delete-and-insert: the editor
 * posts the full set every time, and a delete-then-insert would leave a window
 * in which a concurrent scoring run saw no weights at all and scored the whole
 * school as unmeasurable.
 */
export async function saveWeights(
  ctx: AppContext,
  population: ScorePopulation,
  input: WeightSetting[],
) {
  ctx.require('score.manage')

  const known = new Set(metricsFor(population).map((m) => m.key))
  const rows = input.filter((row) => known.has(row.metric))

  if (rows.length === 0) {
    throw new Error('No recognisable metrics to save')
  }
  if (!rows.some((r) => r.isEnabled && r.weight > 0)) {
    // Every metric off is not a configuration, it is a switched-off score. Said
    // here rather than letting the screens fill with "not enough data".
    throw new Error('Leave at least one metric switched on with a weight above zero')
  }

  const before = await ctx.db.scoreWeight.findMany({
    where: { population },
    select: { metric: true, weight: true, isEnabled: true },
  })

  await ctx.db.$transaction(
    rows.map((row) =>
      ctx.db.scoreWeight.upsert({
        where: {
          tenantId_population_metric: {
            tenantId: ctx.tenant.id,
            population,
            metric: row.metric,
          },
        },
        create: {
          tenantId: ctx.tenant.id,
          population,
          metric: row.metric,
          weight: row.weight,
          isEnabled: row.isEnabled,
          updatedById: ctx.user.userId,
        },
        update: {
          weight: row.weight,
          isEnabled: row.isEnabled,
          updatedById: ctx.user.userId,
        },
      }),
    ),
  )

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'score.weights.update',
    module: 'score',
    entityType: 'ScoreWeight',
    summary: `Changed ${population === 'STUDENT' ? 'student' : 'staff'} score weights`,
    before,
    after: rows,
  })

  return getWeights(ctx, population)
}

/** Drops every override, returning the school to the shipped weights. */
export async function resetWeights(ctx: AppContext, population: ScorePopulation) {
  ctx.require('score.manage')

  const before = await ctx.db.scoreWeight.findMany({
    where: { population },
    select: { metric: true, weight: true, isEnabled: true },
  })

  await ctx.db.scoreWeight.deleteMany({ where: { population } })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'score.weights.reset',
    module: 'score',
    entityType: 'ScoreWeight',
    summary: `Reset ${population === 'STUDENT' ? 'student' : 'staff'} score weights to the defaults`,
    before,
  })

  return getWeights(ctx, population)
}
