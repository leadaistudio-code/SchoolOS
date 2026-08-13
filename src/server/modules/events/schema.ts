import { z } from 'zod'

export const eventSchema = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(4000).optional().or(z.literal('')).transform((v) => v || undefined),
  category: z.string().trim().max(40).default('GENERAL'),
  venue: z.string().trim().max(160).optional().or(z.literal('')).transform((v) => v || undefined),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  registrationOpen: z.coerce.boolean().default(false),
  maxParticipants: z.coerce.number().int().min(1).max(10000).optional(),
}).refine((v) => v.endsAt >= v.startsAt, {
  message: 'End must be after start',
  path: ['endsAt'],
})

export type EventInput = z.infer<typeof eventSchema>

export const registerParticipantSchema = z.object({
  studentId: z.string().cuid(),
  role: z.string().trim().max(40).default('PARTICIPANT'),
})
