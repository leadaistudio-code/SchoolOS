'use server'

import { revalidatePath } from 'next/cache'
import { requirePlatformContext } from '@/server/context'
import { runSchoolLeadDiscovery } from '@/server/modules/platform/growth/discovery/runner'
import {
  discoverySettingsSchema,
  locationCreateSchema,
  setCandidateVerification,
  updateDiscoverySettings,
  upsertDiscoveryLocation,
} from '@/server/modules/platform/growth/discovery/service'
import { syncCandidateToCrm } from '@/server/modules/platform/growth/discovery/sync'

function fail(err: unknown): { ok: false; message: string } {
  return { ok: false, message: err instanceof Error ? err.message : 'Something went wrong' }
}

export async function runDiscoveryNowAction() {
  try {
    const ctx = await requirePlatformContext('platform.crm_edit')
    const report = await runSchoolLeadDiscovery(ctx, { triggeredBy: ctx.user.userId })
    revalidatePath('/platform/growth/discovery')
    return {
      ok: true as const,
      message: `Discovery finished: ${report.createdLeads} created, ${report.updatedLeads} updated, ${report.resultsFound} hits (${report.provider})`,
      report,
    }
  } catch (err) {
    return fail(err)
  }
}

export async function createCrmLeadFromDiscoveryAction(candidateId: string) {
  try {
    const ctx = await requirePlatformContext('platform.crm_create')
    const result = await syncCandidateToCrm(ctx, candidateId, { forceCreate: false })
    revalidatePath('/platform/growth/discovery')
    revalidatePath('/platform/growth/schools')
    if (!result.schoolId) return { ok: false as const, message: 'Could not create or link CRM lead' }
    return {
      ok: true as const,
      message: result.action === 'created' ? 'CRM lead created' : 'CRM lead updated',
      schoolId: result.schoolId,
    }
  } catch (err) {
    return fail(err)
  }
}

export async function rejectDiscoveryAction(candidateId: string, reason?: string) {
  try {
    const ctx = await requirePlatformContext('platform.crm_edit')
    await setCandidateVerification(ctx, candidateId, 'REJECTED', reason)
    revalidatePath('/platform/growth/discovery')
    return { ok: true as const, message: 'Marked rejected' }
  } catch (err) {
    return fail(err)
  }
}

export async function markVerifiedAction(candidateId: string) {
  try {
    const ctx = await requirePlatformContext('platform.crm_edit')
    await setCandidateVerification(ctx, candidateId, 'VERIFIED')
    revalidatePath('/platform/growth/discovery')
    return { ok: true as const, message: 'Marked verified' }
  } catch (err) {
    return fail(err)
  }
}

export async function saveDiscoverySettingsAction(formData: FormData) {
  try {
    const ctx = await requirePlatformContext('platform.crm_edit')
    const parsed = discoverySettingsSchema.parse({
      enabled: formData.get('enabled') === 'on' || formData.get('enabled') === 'true',
      minConfidence: formData.get('minConfidence'),
      autoAddVerified: formData.get('autoAddVerified') === 'on',
      autoAddStrongLead: formData.get('autoAddStrongLead') === 'on',
      autoAddNeedsVerification: formData.get('autoAddNeedsVerification') === 'on',
    })
    await updateDiscoverySettings(ctx, parsed)
    revalidatePath('/platform/growth/discovery')
    return { ok: true as const, message: 'Settings saved' }
  } catch (err) {
    return fail(err)
  }
}

export async function addDiscoveryLocationAction(formData: FormData) {
  try {
    const ctx = await requirePlatformContext('platform.crm_edit')
    const parsed = locationCreateSchema.parse({
      city: formData.get('city'),
      region: formData.get('region') || undefined,
      state: formData.get('state') || 'Haryana',
      priority: formData.get('priority') || 50,
      enabled: true,
    })
    await upsertDiscoveryLocation(ctx, parsed)
    revalidatePath('/platform/growth/discovery')
    return { ok: true as const, message: `${parsed.city} added` }
  } catch (err) {
    return fail(err)
  }
}
