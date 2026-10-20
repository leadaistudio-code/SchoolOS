import { prisma } from '@/server/db/prisma'
import type { AppContext } from '@/server/context'
import { ApiException } from '@/server/api/response'
import {
  DEFAULT_PLATFORM_LIMITS,
  effectiveLimits,
  type EffectiveLimits,
  type PlatformLimits,
  type SchoolPolicyFields,
} from '@/lib/tapasya/policy'
import { DEFAULT_SCORING_RULES, normalizeRules, type ScoringRules } from '@/lib/tapasya/scoring'
import { DEFAULT_LEADERBOARD_TIMEZONE } from '@/lib/tapasya/periods'

/**
 * Platform switches and the shared scoring rules.
 *
 * These live in platform-only tables and are read here with the unscoped
 * client. Nothing in this file accepts a school's input: a school can change
 * its own policy row (below) but has no path to the global rules.
 */

export type GlobalSettings = {
  leaderboardEnabled: boolean
  /** The labelled example board ("See an example") is available. */
  previewEnabled: boolean
  timezone: string
  limits: PlatformLimits
}

export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  leaderboardEnabled: true,
  previewEnabled: true,
  timezone: DEFAULT_LEADERBOARD_TIMEZONE,
  limits: DEFAULT_PLATFORM_LIMITS,
}

const SETTINGS_KEY = 'platform'

export async function getGlobalSettings(): Promise<GlobalSettings> {
  const row = await prisma.globalTapasyaSetting.findUnique({ where: { key: SETTINGS_KEY } })
  const v = (row?.value ?? {}) as Partial<GlobalSettings>
  return {
    ...DEFAULT_GLOBAL_SETTINGS,
    ...v,
    limits: { ...DEFAULT_PLATFORM_LIMITS, ...(v.limits ?? {}) },
  }
}

export async function saveGlobalSettings(next: GlobalSettings, actorId: string): Promise<void> {
  await prisma.globalTapasyaSetting.upsert({
    where: { key: SETTINGS_KEY },
    create: { key: SETTINGS_KEY, value: next as never, updatedById: actorId },
    update: { value: next as never, updatedById: actorId },
  })
}

export type ActiveScoring = { version: number; rules: ScoringRules; effectiveFrom: Date | null }

/**
 * The rule set in force at `at`: the highest version whose effective date has
 * passed. Version 0 is the built-in default, used until a platform admin
 * publishes anything — so a fresh install scores consistently from day one.
 */
export async function scoringAt(at: Date): Promise<ActiveScoring> {
  const row = await prisma.globalScoringConfig.findFirst({
    where: { effectiveFrom: { lte: at } },
    orderBy: { version: 'desc' },
  })
  if (!row) return { version: 0, rules: DEFAULT_SCORING_RULES, effectiveFrom: null }
  return { version: row.version, rules: normalizeRules(row.rules), effectiveFrom: row.effectiveFrom }
}

export const SCHOOL_POLICY_DEFAULTS = {
  enabled: true,
  globalLeaderboardAllowed: true,
  schoolLeaderboardEnabled: false,
  minFocusMinutes: 10,
  maxFocusMinutes: 90,
  minBreakMinutes: 2,
  maxBreakMinutes: 30,
  allowPause: true,
  allowSkipBreak: true,
  maxUnlockMinutes: 15,
  maxUnlockRequestsPerDay: 5,
}

export type SchoolPolicy = typeof SCHOOL_POLICY_DEFAULTS

export async function getSchoolPolicy(ctx: AppContext): Promise<SchoolPolicy> {
  const row = await ctx.db.tapasyaSchoolPolicy.findFirst({})
  if (!row) return { ...SCHOOL_POLICY_DEFAULTS }
  return {
    enabled: row.enabled,
    globalLeaderboardAllowed: row.globalLeaderboardAllowed,
    schoolLeaderboardEnabled: row.schoolLeaderboardEnabled,
    minFocusMinutes: row.minFocusMinutes,
    maxFocusMinutes: row.maxFocusMinutes,
    minBreakMinutes: row.minBreakMinutes,
    maxBreakMinutes: row.maxBreakMinutes,
    allowPause: row.allowPause,
    allowSkipBreak: row.allowSkipBreak,
    maxUnlockMinutes: row.maxUnlockMinutes,
    maxUnlockRequestsPerDay: row.maxUnlockRequestsPerDay,
  }
}

/** Throws the same 403 everywhere when a school has switched Tapasya off. */
export async function requireTapasyaEnabled(ctx: AppContext): Promise<SchoolPolicy> {
  const policy = await getSchoolPolicy(ctx)
  if (!policy.enabled) throw new ApiException(403, 'TAPASYA_DISABLED', 'Tapasya Mode is switched off for your school.')
  return policy
}

export async function limitsFor(ctx: AppContext): Promise<{ limits: EffectiveLimits; policy: SchoolPolicy; platform: PlatformLimits }> {
  const [settings, policy] = await Promise.all([getGlobalSettings(), getSchoolPolicy(ctx)])
  const school: SchoolPolicyFields = policy
  return { limits: effectiveLimits(settings.limits, school), policy, platform: settings.limits }
}
