import { z } from 'zod'
import { TEMPLATE_CHANNELS, TEMPLATE_EVENTS } from '@/lib/notification-templates'

export { TEMPLATE_CHANNELS, TEMPLATE_EVENTS }

export const notificationTemplateSchema = z.object({
  eventKey: z.string().min(2).max(80),
  channel: z.enum(TEMPLATE_CHANNELS),
  subject: z.string().trim().max(200).optional().or(z.literal('')).transform((v) => v || undefined),
  body: z.string().trim().min(1).max(4000),
  isActive: z.coerce.boolean().default(true),
})

export type NotificationTemplateInput = z.infer<typeof notificationTemplateSchema>
