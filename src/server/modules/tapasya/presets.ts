import type { TapasyaPreset } from '@prisma/client'
import type { z } from 'zod'
import type { AppContext } from '@/server/context'
import { ApiException, conflict, notFound } from '@/server/api/response'
import { tenantTx } from '@/server/db/tenant-client'
import { BUILTIN_PRESETS, builtinPreset, validatePreset, type EffectiveLimits, type PolicyIssue, type PresetFields } from '@/lib/tapasya/policy'
import { limitsFor } from './config'
import type { presetSchema } from './schema'

const MAX_PRESETS = 20

export type PresetDto = PresetFields & {
  ref: string
  id: string | null
  builtinKey: string | null
  description: string | null
  isDefault: boolean
  sourceKey: string | null
  /** Why this preset cannot be used under the current policy. Empty = usable. */
  issues: PolicyIssue[]
}

function fields(p: PresetFields): PresetFields {
  return {
    name: p.name,
    focusMinutes: p.focusMinutes,
    shortBreakMinutes: p.shortBreakMinutes,
    longBreakMinutes: p.longBreakMinutes,
    cyclesBeforeLongBreak: p.cyclesBeforeLongBreak,
    autoStartBreak: p.autoStartBreak,
    autoStartFocus: p.autoStartFocus,
    allowPause: p.allowPause,
    allowSkipBreak: p.allowSkipBreak,
    soundEnabled: p.soundEnabled,
    hapticsEnabled: p.hapticsEnabled,
  }
}

function personalDto(p: TapasyaPreset, limits: EffectiveLimits): PresetDto {
  return { ...fields(p), ref: p.id, id: p.id, builtinKey: null, description: null, isDefault: p.isDefault, sourceKey: p.sourceKey, issues: validatePreset(p, limits) }
}

export async function listPresets(ctx: AppContext): Promise<{ builtins: PresetDto[]; personal: PresetDto[]; limits: EffectiveLimits }> {
  const { limits } = await limitsFor(ctx)
  const rows = await ctx.db.tapasyaPreset.findMany({ where: { ownerUserId: ctx.user.userId, archivedAt: null }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] })
  return {
    builtins: BUILTIN_PRESETS.map((b) => ({
      ...fields(b),
      ref: `builtin:${b.key}`,
      id: null,
      builtinKey: b.key,
      description: b.description,
      isDefault: false,
      sourceKey: null,
      issues: validatePreset(b, limits),
    })),
    personal: rows.map((r) => personalDto(r, limits)),
    limits,
  }
}

function rejectIfInvalid(p: PresetFields, limits: EffectiveLimits) {
  const issues = validatePreset(p, limits)
  if (issues.length) throw new ApiException(422, 'PRESET_OUT_OF_POLICY', issues[0]!.message, issues)
}

export async function createPreset(ctx: AppContext, input: z.infer<typeof presetSchema>, source?: { key: string; version: number }): Promise<PresetDto> {
  const { limits } = await limitsFor(ctx)
  rejectIfInvalid(input, limits)
  const count = await ctx.db.tapasyaPreset.count({ where: { ownerUserId: ctx.user.userId, archivedAt: null } })
  if (count >= MAX_PRESETS) throw conflict(`You can keep up to ${MAX_PRESETS} presets.`)
  const row = await tenantTx(ctx.tenant.id, async (tx) => {
    if (input.isDefault) await tx.tapasyaPreset.updateMany({ where: { ownerUserId: ctx.user.userId }, data: { isDefault: false } })
    return tx.tapasyaPreset.create({
      data: {
        tenantId: ctx.tenant.id,
        ownerUserId: ctx.user.userId,
        ...fields(input),
        name: input.name.trim(),
        isDefault: Boolean(input.isDefault),
        sourceKey: source?.key ?? null,
        sourceVersion: source?.version ?? null,
      },
    })
  })
  return personalDto(row, limits)
}

async function ownPreset(ctx: AppContext, id: string): Promise<TapasyaPreset> {
  const p = await ctx.db.tapasyaPreset.findFirst({ where: { id, ownerUserId: ctx.user.userId, archivedAt: null } })
  if (!p) throw notFound('Preset')
  return p
}

export async function updatePreset(ctx: AppContext, id: string, input: z.infer<typeof presetSchema>): Promise<PresetDto> {
  await ownPreset(ctx, id)
  const { limits } = await limitsFor(ctx)
  rejectIfInvalid(input, limits)
  const row = await tenantTx(ctx.tenant.id, async (tx) => {
    if (input.isDefault) await tx.tapasyaPreset.updateMany({ where: { ownerUserId: ctx.user.userId, id: { not: id } }, data: { isDefault: false } })
    return tx.tapasyaPreset.update({
      where: { id },
      data: { ...fields(input), name: input.name.trim(), ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}) },
    })
  })
  return personalDto(row, limits)
}

/** Copies a built-in or personal preset into a new personal one. */
export async function duplicatePreset(ctx: AppContext, ref: string): Promise<PresetDto> {
  if (ref.startsWith('builtin:')) {
    const b = builtinPreset(ref.slice('builtin:'.length))
    if (!b) throw notFound('Preset')
    return createPreset(ctx, { ...fields(b), name: `${b.name} (mine)`.slice(0, 40), isDefault: false }, { key: b.key, version: b.version })
  }
  const p = await ownPreset(ctx, ref)
  return createPreset(ctx, { ...fields(p), name: `${p.name} copy`.slice(0, 40), isDefault: false }, p.sourceKey && p.sourceVersion ? { key: p.sourceKey, version: p.sourceVersion } : undefined)
}

/** Archived, not deleted: past sessions keep pointing at the settings they ran with. */
export async function deletePreset(ctx: AppContext, id: string): Promise<void> {
  await ownPreset(ctx, id)
  await ctx.db.tapasyaPreset.update({ where: { id }, data: { archivedAt: new Date(), isDefault: false } })
}
