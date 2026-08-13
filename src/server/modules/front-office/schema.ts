import { z } from 'zod'

export const visitorCheckInSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(20).optional().or(z.literal('')).transform((v) => v || undefined),
  purpose: z.string().trim().min(2).max(200),
  toMeet: z.string().trim().max(120).optional().or(z.literal('')).transform((v) => v || undefined),
  idProofNo: z.string().trim().max(60).optional().or(z.literal('')).transform((v) => v || undefined),
  personCount: z.coerce.number().int().min(1).max(50).default(1),
})

export type VisitorCheckInInput = z.infer<typeof visitorCheckInSchema>

export const appointmentSchema = z.object({
  title: z.string().trim().min(2).max(160),
  visitorName: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(20).optional().or(z.literal('')).transform((v) => v || undefined),
  scheduledAt: z.coerce.date(),
  notes: z.string().trim().max(1000).optional().or(z.literal('')).transform((v) => v || undefined),
  withStaffId: z.string().cuid().optional().or(z.literal('')).transform((v) => v || undefined),
})

export type AppointmentInput = z.infer<typeof appointmentSchema>

export const appointmentStatusSchema = z.object({
  status: z.enum(['SCHEDULED', 'DONE', 'CANCELLED', 'NO_SHOW']),
})
