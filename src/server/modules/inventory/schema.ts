import { z } from 'zod'

export const assetSchema = z.object({
  name: z.string().trim().min(1).max(160),
  assetCode: z.string().trim().min(1).max(40),
  categoryId: z.string().cuid().optional().or(z.literal('')).transform((v) => v || undefined),
  description: z.string().trim().max(1000).optional().or(z.literal('')).transform((v) => v || undefined),
  quantity: z.coerce.number().int().min(1).max(100000).default(1),
  location: z.string().trim().max(120).optional().or(z.literal('')).transform((v) => v || undefined),
  vendorName: z.string().trim().max(120).optional().or(z.literal('')).transform((v) => v || undefined),
  purchasePriceMinor: z.coerce.number().int().min(0).optional(),
  condition: z.enum(['NEW', 'GOOD', 'FAIR', 'NEEDS_REPAIR', 'DISPOSED']).default('GOOD'),
})

export type AssetInput = z.infer<typeof assetSchema>

export const assetActionSchema = z.object({
  action: z.enum(['ASSIGNED', 'RETURNED', 'MAINTENANCE', 'DISPOSED', 'MOVED']),
  notes: z.string().trim().max(500).optional().or(z.literal('')).transform((v) => v || undefined),
  location: z.string().trim().max(120).optional().or(z.literal('')).transform((v) => v || undefined),
  assignedToStaffId: z
    .string()
    .cuid()
    .optional()
    .or(z.literal(''))
    .transform((v) => v || undefined),
})

export type AssetActionInput = z.infer<typeof assetActionSchema>

export const assetCategorySchema = z.object({
  name: z.string().trim().min(1).max(80),
})
