import { z } from 'zod'
import { FEATURE } from '@/lib/features'

/** Turn free-text into a valid tenant subdomain slug. */
export function normalizeTenantSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export const slugSchema = z
  .string()
  .transform(normalizeTenantSlug)
  .pipe(
    z
      .string()
      .min(2, 'Slug must be at least 2 characters after normalisation')
      .max(48)
      .regex(/^[a-z0-9-]+$/, 'Use letters, numbers and hyphens only'),
  )

export const provisionTenantSchema = z.object({
  slug: slugSchema,
  schoolName: z.string().min(2).max(200),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(10),
  adminName: z.string().min(2).max(120).optional(),
  planId: z.string().cuid(),
  trial: z.boolean().default(true),
  host: z.string().max(253).optional(),
})

export const listTenantsSchema = z.object({
  q: z.string().optional(),
  status: z.string().optional(),
  planId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
})

export const updateTenantSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  planId: z.string().cuid().optional(),
  timezone: z.string().optional(),
  currency: z.string().length(3).optional(),
})

export const listInvoicesSchema = z.object({
  status: z.string().optional(),
  tenantId: z.string().cuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
})

export const listSupportTicketsSchema = z.object({
  status: z.string().optional(),
  priority: z.string().optional(),
  tenantId: z.string().cuid().optional(),
  assigneeId: z.string().cuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
})

export const usageSnapshotSchema = z.object({
  tenantId: z.string().cuid(),
})

const featureKeys = Object.values(FEATURE) as [string, ...string[]]

export const entitlementOverrideSchema = z.object({
  featureKey: z.enum(featureKeys),
  enabled: z.boolean().optional(),
  limitValue: z.number().int().min(0).nullable().optional(),
  note: z.string().max(500).optional(),
})

export const planUpsertSchema = z.object({
  code: z.string().min(2).max(40).regex(/^[A-Z0-9_]+$/),
  name: z.string().min(2).max(120),
  tier: z.enum(['STARTER', 'PRO', 'ENTERPRISE', 'CUSTOM']),
  description: z.string().max(500).optional(),
  priceMinor: z.number().int().min(0),
  currency: z.string().length(3).default('INR'),
  cycle: z.enum(['MONTHLY', 'QUARTERLY', 'YEARLY']).default('YEARLY'),
  trialDays: z.number().int().min(0).max(90).default(14),
  isPublic: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
})

export const planEntitlementSchema = z.object({
  featureKey: z.string(),
  enabled: z.boolean(),
  limitValue: z.number().int().min(0).nullable().optional(),
})

export const generateInvoiceSchema = z.object({
  subscriptionId: z.string().cuid().optional(),
  tenantId: z.string().cuid().optional(),
  dueInDays: z.number().int().min(1).max(90).default(14),
  notes: z.string().max(500).optional(),
})

export const supportTicketCreateSchema = z.object({
  subject: z.string().min(3).max(200),
  body: z.string().min(10).max(8000),
  category: z.string().max(80).optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
})

export const supportMessageSchema = z.object({
  body: z.string().min(1).max(8000),
})

export const supportTicketUpdateSchema = z.object({
  status: z.enum(['OPEN', 'PENDING', 'RESOLVED', 'CLOSED']).optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
  assigneeId: z.string().cuid().nullable().optional(),
  category: z.string().max(80).nullable().optional(),
})

export const impersonateSchema = z.object({
  userId: z.string().cuid(),
  tenantId: z.string().cuid(),
})
