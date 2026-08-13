'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requirePlatformContext } from '@/server/context'
import {
  archiveTenant,
  provisionTenant,
  reactivateTenant,
  setEntitlementOverride,
  suspendTenant,
  updateTenant,
} from '@/server/modules/platform/tenants'
import { createPlan, updatePlan } from '@/server/modules/platform/plans'
import {
  generateInvoice,
  markInvoicePaid,
  runOverdueScan,
  voidInvoice,
} from '@/server/modules/platform/billing'
import { replyPlatformTicket, updatePlatformTicket } from '@/server/modules/platform/support'
import { startImpersonation } from '@/server/modules/platform/impersonation'
import {
  entitlementOverrideSchema,
  generateInvoiceSchema,
  planUpsertSchema,
  provisionTenantSchema,
  supportMessageSchema,
  supportTicketUpdateSchema,
} from '@/server/modules/platform/schema'
import { redirectWithFormError } from '@/server/modules/platform/action-errors'

export async function provisionSchoolAction(formData: FormData) {
  const ctx = await requirePlatformContext('platform.tenants')
  const parsed = provisionTenantSchema.safeParse({
    slug: formData.get('slug'),
    schoolName: formData.get('schoolName'),
    adminEmail: formData.get('adminEmail'),
    adminPassword: formData.get('adminPassword'),
    adminName: formData.get('adminName') || undefined,
    planId: formData.get('planId'),
    trial: formData.get('trial') === 'on',
  })

  if (!parsed.success) {
    redirectWithFormError('/platform/tenants', parsed.error)
  }

  try {
    const { tenant } = await provisionTenant(ctx, parsed.data)
    revalidatePath('/platform')
    revalidatePath('/platform/tenants')
    redirect(`/platform/tenants/${tenant.id}`)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Provisioning failed'
    redirect(`/platform/tenants?error=${encodeURIComponent(message)}`)
  }
}

export async function suspendTenantAction(id: string) {
  const ctx = await requirePlatformContext('platform.tenants')
  await suspendTenant(ctx, id)
  revalidatePath(`/platform/tenants/${id}`)
  revalidatePath('/platform/tenants')
}

export async function reactivateTenantAction(id: string) {
  const ctx = await requirePlatformContext('platform.tenants')
  await reactivateTenant(ctx, id)
  revalidatePath(`/platform/tenants/${id}`)
  revalidatePath('/platform/tenants')
}

export async function archiveTenantAction(id: string) {
  const ctx = await requirePlatformContext('platform.tenants')
  await archiveTenant(ctx, id)
  revalidatePath(`/platform/tenants/${id}`)
  revalidatePath('/platform/tenants')
}

export async function changeTenantPlanAction(id: string, formData: FormData) {
  const ctx = await requirePlatformContext('platform.tenants')
  const planId = String(formData.get('planId'))
  await updateTenant(ctx, id, { planId })
  revalidatePath(`/platform/tenants/${id}`)
}

export async function setOverrideAction(tenantId: string, formData: FormData) {
  const ctx = await requirePlatformContext('platform.tenants')
  const parsed = entitlementOverrideSchema.safeParse({
    featureKey: formData.get('featureKey'),
    enabled: formData.get('enabled') === 'true' ? true : formData.get('enabled') === 'false' ? false : undefined,
    limitValue: formData.get('limitValue') ? Number(formData.get('limitValue')) : null,
    note: formData.get('note') || undefined,
  })
  if (!parsed.success) {
    redirectWithFormError(`/platform/tenants/${tenantId}`, parsed.error)
  }
  await setEntitlementOverride(ctx, tenantId, parsed.data)
  revalidatePath(`/platform/tenants/${tenantId}`)
}

export async function generateInvoiceAction(formData: FormData) {
  const ctx = await requirePlatformContext('platform.billing')
  const parsed = generateInvoiceSchema.safeParse({
    tenantId: formData.get('tenantId') || undefined,
    subscriptionId: formData.get('subscriptionId') || undefined,
    dueInDays: formData.get('dueInDays') ? Number(formData.get('dueInDays')) : 14,
    notes: formData.get('notes') || undefined,
  })
  if (!parsed.success) redirectWithFormError('/platform/billing', parsed.error)
  await generateInvoice(ctx, parsed.data)
  revalidatePath('/platform/billing')
}

export async function payInvoiceAction(id: string) {
  const ctx = await requirePlatformContext('platform.billing')
  await markInvoicePaid(ctx, id)
  revalidatePath('/platform/billing')
}

export async function voidInvoiceAction(id: string) {
  const ctx = await requirePlatformContext('platform.billing')
  await voidInvoice(ctx, id)
  revalidatePath('/platform/billing')
}

export async function runOverdueAction() {
  const ctx = await requirePlatformContext('platform.billing')
  await runOverdueScan(ctx)
  revalidatePath('/platform/billing')
  revalidatePath('/platform/tenants')
}

export async function updatePlanAction(id: string, formData: FormData) {
  const ctx = await requirePlatformContext('platform.plans')
  const parsed = planUpsertSchema.partial().safeParse({
    name: formData.get('name') || undefined,
    priceMinor: formData.get('priceMinor') ? Number(formData.get('priceMinor')) : undefined,
    trialDays: formData.get('trialDays') ? Number(formData.get('trialDays')) : undefined,
    isPublic: formData.get('isPublic') === 'on',
  })
  if (!parsed.success) redirectWithFormError('/platform/plans', parsed.error)
  await updatePlan(ctx, id, parsed.data)
  revalidatePath('/platform/plans')
}

export async function createPlanAction(formData: FormData) {
  const ctx = await requirePlatformContext('platform.plans')
  const parsed = planUpsertSchema.safeParse({
    code: formData.get('code'),
    name: formData.get('name'),
    tier: formData.get('tier'),
    priceMinor: Number(formData.get('priceMinor')),
    trialDays: Number(formData.get('trialDays') ?? 14),
    cycle: formData.get('cycle') ?? 'YEARLY',
  })
  if (!parsed.success) redirectWithFormError('/platform/plans', parsed.error)
  await createPlan(ctx, parsed.data)
  revalidatePath('/platform/plans')
}

export async function updateTicketAction(id: string, formData: FormData) {
  const ctx = await requirePlatformContext('platform.support')
  const parsed = supportTicketUpdateSchema.safeParse({
    status: formData.get('status') || undefined,
    priority: formData.get('priority') || undefined,
  })
  if (!parsed.success) redirectWithFormError(`/platform/support/${id}`, parsed.error)
  await updatePlatformTicket(ctx, id, parsed.data)
  revalidatePath('/platform/support')
  revalidatePath(`/platform/support/${id}`)
}

export async function replyTicketAction(id: string, formData: FormData) {
  const ctx = await requirePlatformContext('platform.support')
  const parsed = supportMessageSchema.safeParse({ body: formData.get('body') })
  if (!parsed.success) redirectWithFormError(`/platform/support/${id}`, parsed.error)
  await replyPlatformTicket(ctx, id, parsed.data)
  revalidatePath(`/platform/support/${id}`)
}

export async function impersonateAction(tenantId: string, userId: string) {
  const ctx = await requirePlatformContext('platform.impersonate')
  const result = await startImpersonation(ctx, { tenantId, userId })
  redirect(result.redirectTo)
}
