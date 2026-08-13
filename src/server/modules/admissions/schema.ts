import { z } from 'zod'
import {
  FOLLOW_UP_CHANNELS,
  LEAD_SOURCES,
  LEAD_STAGES,
  OPEN_STAGES,
  STAGE_LABELS,
  type LeadStage,
} from '@/lib/admissions'

export {
  FOLLOW_UP_CHANNELS,
  LEAD_SOURCES,
  LEAD_STAGES,
  OPEN_STAGES,
  STAGE_LABELS,
  type LeadStage,
}

const optionalEmail = z
  .string()
  .trim()
  .email('Enter a valid email')
  .optional()
  .or(z.literal(''))
  .transform((v) => (v === '' ? undefined : v))

const phone = z
  .string()
  .trim()
  .min(7, 'Enter a phone number')
  .max(20)
  .regex(/^[0-9+\-\s()]+$/, 'Enter a valid phone number')

export const leadCreateSchema = z.object({
  studentName: z.string().trim().min(2).max(120),
  parentName: z.string().trim().min(2).max(120),
  phone,
  email: optionalEmail,
  source: z.enum(LEAD_SOURCES).default('WALK_IN'),
  interestedClassId: z
    .string()
    .cuid()
    .optional()
    .or(z.literal(''))
    .transform((v) => v || undefined),
  assignedToId: z
    .string()
    .cuid()
    .optional()
    .or(z.literal(''))
    .transform((v) => v || undefined),
  nextFollowUpOn: z.coerce.date().optional().nullable(),
  notes: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .or(z.literal(''))
    .transform((v) => v || undefined),
})

export type LeadCreateInput = z.infer<typeof leadCreateSchema>

export const leadUpdateSchema = leadCreateSchema.partial()

export type LeadUpdateInput = z.infer<typeof leadUpdateSchema>

export const leadStageSchema = z.object({
  stage: z.enum(LEAD_STAGES),
  lostReason: z.string().trim().min(2).max(400).optional(),
  note: z.string().trim().max(1000).optional(),
})

export type LeadStageInput = z.infer<typeof leadStageSchema>

export const followUpCreateSchema = z.object({
  dueOn: z.coerce.date(),
  channel: z.enum(FOLLOW_UP_CHANNELS).default('CALL'),
  note: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .or(z.literal(''))
    .transform((v) => v || undefined),
  assignedToId: z
    .string()
    .cuid()
    .optional()
    .or(z.literal(''))
    .transform((v) => v || undefined),
})

export type FollowUpCreateInput = z.infer<typeof followUpCreateSchema>

export const followUpCompleteSchema = z.object({
  outcome: z.string().trim().min(2).max(1000),
})

export type FollowUpCompleteInput = z.infer<typeof followUpCompleteSchema>

export const leadConvertSchema = z.object({
  admissionNo: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[A-Za-z0-9/_-]+$/, 'Use letters, numbers, dash, slash or underscore only'),
  classLevelId: z.string().min(1),
  sectionId: z.string().min(1),
  firstName: z.string().trim().min(1).max(60).optional(),
  lastName: z.string().trim().min(1).max(60).optional(),
  guardianRelation: z.enum(['FATHER', 'MOTHER', 'GUARDIAN', 'OTHER']).default('GUARDIAN'),
})

export type LeadConvertInput = z.infer<typeof leadConvertSchema>

/** Public enquiry form — honeypot field `company` must stay empty. */
export const publicEnquireSchema = z.object({
  studentName: z.string().trim().min(2).max(120),
  parentName: z.string().trim().min(2).max(120),
  phone,
  email: optionalEmail,
  interestedClass: z
    .string()
    .trim()
    .max(80)
    .optional()
    .or(z.literal(''))
    .transform((v) => v || undefined),
  notes: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .or(z.literal(''))
    .transform((v) => v || undefined),
  company: z.string().max(0).optional().default(''),
})

export type PublicEnquireInput = z.infer<typeof publicEnquireSchema>
