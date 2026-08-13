import { z } from 'zod'

export const sportSchema = z.object({
  name: z.string().trim().min(1).max(80),
  category: z.string().trim().max(60).optional().or(z.literal('')).transform((v) => v || undefined),
  coachStaffId: z.string().cuid().optional().or(z.literal('')).transform((v) => v || undefined),
})

export const teamSchema = z.object({
  sportId: z.string().cuid(),
  name: z.string().trim().min(1).max(80),
  ageGroup: z.string().trim().max(40).optional().or(z.literal('')).transform((v) => v || undefined),
  coachStaffId: z.string().cuid().optional().or(z.literal('')).transform((v) => v || undefined),
})

export const teamMemberSchema = z.object({
  teamId: z.string().cuid(),
  studentId: z.string().cuid(),
  position: z.string().trim().max(40).optional().or(z.literal('')).transform((v) => v || undefined),
  isCaptain: z.coerce.boolean().default(false),
})
