import { z } from 'zod'
import {
  ACTIVITY_TYPES,
  BOARDS,
  CONTACT_ROLES,
  CRM_CHANNELS,
  CRM_STAGES,
  FOLLOW_UP_TYPES,
  LEAD_SOURCES,
  LOST_REASONS,
  MEETING_MODES,
  SCHOOL_TYPES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  TEMPERATURES,
} from '@/lib/growth-crm'

const empty = z
  .string()
  .optional()
  .transform((v) => {
    const t = v?.trim()
    return t ? t : undefined
  })

const optionalCuid = z
  .string()
  .optional()
  .transform((v) => {
    const t = v?.trim()
    return t ? t : undefined
  })
  .pipe(z.string().cuid().optional())

const optionalInt = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v) => {
    if (v === undefined || v === '') return undefined
    const n = typeof v === 'number' ? v : Number(String(v).replace(/[, ]/g, ''))
    return Number.isFinite(n) ? Math.round(n) : undefined
  })

const moneyRupees = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v) => {
    if (v === undefined || v === '') return 0
    const n = typeof v === 'number' ? v : Number(String(v).replace(/[, ]/g, ''))
    if (!Number.isFinite(n) || n < 0) return 0
    return Math.round(n * 100)
  })

const optionalDate = z
  .string()
  .optional()
  .transform((v) => {
    const t = v?.trim()
    if (!t) return undefined
    const d = new Date(t)
    return Number.isNaN(d.getTime()) ? undefined : d
  })

const optionalBool = z
  .union([z.literal('on'), z.literal('true'), z.literal('false'), z.boolean(), z.undefined()])
  .transform((v) => v === true || v === 'on' || v === 'true')

export const schoolCreateSchema = z.object({
  name: z.string().trim().min(2, 'Enter the school name').max(200),
  schoolType: z.enum(SCHOOL_TYPES).optional().or(z.literal('')).transform((v) => v || undefined),
  board: z.enum(BOARDS).optional().or(z.literal('')).transform((v) => v || undefined),
  studentCount: optionalInt,
  branchCount: optionalInt,
  city: empty,
  state: empty,
  address: empty,
  website: empty,
  phone: empty,
  email: empty,
  currentErp: empty,
  currentErpVendor: empty,
  erpRenewalOn: optionalDate,
  leadSource: z.enum(LEAD_SOURCES).optional().or(z.literal('')).transform((v) => v || undefined),
  campaign: empty,
  sourceDetails: empty,
  ownerId: optionalCuid,
  temperature: z.enum(TEMPERATURES).optional(),
  stage: z.enum(CRM_STAGES).optional(),
  dealValue: moneyRupees,
  arr: moneyRupees,
  probability: optionalInt,
  expectedCloseOn: optionalDate,
  competitor: empty,
  primaryObjection: empty,
  nextFollowUpAt: optionalDate,
  nextAction: empty,
  notes: empty,
  confirmDuplicate: optionalBool,
})

export type SchoolCreateInput = z.infer<typeof schoolCreateSchema>
export const schoolUpdateSchema = schoolCreateSchema.partial().extend({
  name: z.string().trim().min(2).max(200).optional(),
})
export type SchoolUpdateInput = z.infer<typeof schoolUpdateSchema>

export const contactCreateSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  designation: z.enum(CONTACT_ROLES).optional().or(z.literal('')).transform((v) => v || undefined),
  mobile: empty,
  whatsapp: empty,
  email: empty,
  preferredChannel: empty,
  isDecisionMaker: optionalBool,
  isInfluencer: optionalBool,
  isPrimary: optionalBool,
  notes: empty,
})
export type ContactCreateInput = z.infer<typeof contactCreateSchema>

export const stageChangeSchema = z.object({
  stage: z.enum(CRM_STAGES),
  lostReason: z.enum(LOST_REASONS).optional().or(z.literal('')).transform((v) => v || undefined),
  lostCompetitor: empty,
  lostNotes: empty,
  recontactOn: optionalDate,
  wonTenantId: optionalCuid,
})
export type StageChangeInput = z.infer<typeof stageChangeSchema>

export const activityCreateSchema = z.object({
  type: z.enum(ACTIVITY_TYPES).default('NOTE'),
  summary: z.string().trim().min(2).max(400),
  body: empty,
  contactId: optionalCuid,
})
export type ActivityCreateInput = z.infer<typeof activityCreateSchema>

export const visitLogSchema = z.object({
  visitDate: z.string().trim().min(8),
  startTime: empty,
  endTime: empty,
  teamMembers: empty,
  contactsMet: empty,
  purpose: empty,
  meetingType: empty,
  summary: z.string().trim().min(2, 'Enter what was discussed').max(4000),
  painPoints: empty,
  currentErp: empty,
  liked: empty,
  objections: empty,
  competitors: empty,
  outcome: empty,
  nextAction: empty,
  documentsRequested: empty,
  dealConfidence: empty,
  followUpRequired: optionalBool,
  followUpAt: optionalDate,
  followUpType: z.enum(FOLLOW_UP_TYPES).optional().or(z.literal('')).transform((v) => v || undefined),
})
export type VisitLogInput = z.infer<typeof visitLogSchema>

export const followUpCreateSchema = z.object({
  dueAt: z.string().trim().min(8, 'Choose a due date'),
  dueTime: empty,
  type: z.enum(FOLLOW_UP_TYPES).default('CALL'),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
  note: empty,
  contactId: optionalCuid,
  assignedToId: optionalCuid,
})
export type FollowUpCreateInput = z.infer<typeof followUpCreateSchema>

export const schoolListFilterSchema = z.object({
  q: empty,
  stage: z.enum(CRM_STAGES).optional().or(z.literal('')).transform((v) => v || undefined),
  ownerId: optionalCuid,
  leadSource: z.enum(LEAD_SOURCES).optional().or(z.literal('')).transform((v) => v || undefined),
  city: empty,
  temperature: z.enum(TEMPERATURES).optional().or(z.literal('')).transform((v) => v || undefined),
  schoolType: z.enum(SCHOOL_TYPES).optional().or(z.literal('')).transform((v) => v || undefined),
  overdue: optionalBool,
  noNextAction: optionalBool,
  stale: optionalBool,
})
export type SchoolListFilter = z.infer<typeof schoolListFilterSchema>

export const meetingCreateSchema = z.object({
  startsAt: z.string().trim().min(8, 'Choose a start time'),
  endsAt: empty,
  meetingType: z.string().trim().min(1).default('Discovery'),
  mode: z.enum(MEETING_MODES).default('PHYSICAL'),
  location: empty,
  meetingLink: empty,
  agenda: empty,
  notes: empty,
  contactId: optionalCuid,
})
export type MeetingCreateInput = z.infer<typeof meetingCreateSchema>

export const taskCreateSchema = z.object({
  title: z.string().trim().min(2, 'Enter a task title').max(200),
  description: empty,
  dueAt: empty,
  dueTime: empty,
  priority: z.enum(TASK_PRIORITIES).default('NORMAL'),
  ownerId: optionalCuid,
  contactId: optionalCuid,
})
export type TaskCreateInput = z.infer<typeof taskCreateSchema>

export const taskStatusSchema = z.object({
  status: z.enum(TASK_STATUSES),
})

export const templateCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  category: z.string().trim().min(2).max(80),
  channel: z.enum(CRM_CHANNELS),
  subject: empty,
  body: z.string().trim().min(2, 'Enter the message body').max(4000),
})
export type TemplateCreateInput = z.infer<typeof templateCreateSchema>

export const sendMessageSchema = z
  .object({
    channel: z.enum(CRM_CHANNELS),
    contactId: optionalCuid,
    templateId: optionalCuid,
    subject: empty,
    body: empty,
    proposalLink: empty,
  })
  .refine((v) => Boolean(v.body || v.templateId), {
    message: 'Write a message or pick a template',
    path: ['body'],
  })
export type SendMessageInput = z.infer<typeof sendMessageSchema>

/** Mobile field capture — only the fields needed to keep the funnel trackable. */
export const fieldCaptureSchema = z.object({
  name: z.string().trim().min(2, 'Enter the school name').max(200),
  city: z.string().trim().min(2, 'Enter the city').max(80),
  contactName: z.string().trim().min(2, 'Enter who you met').max(120),
  contactDesignation: z.enum(CONTACT_ROLES).optional().or(z.literal('')).transform((v) => v || 'PRINCIPAL'),
  contactMobile: z.string().trim().min(8, 'Enter a mobile number').max(20),
  isDecisionMaker: optionalBool,
  leadSource: z.enum(LEAD_SOURCES).optional().or(z.literal('')).transform((v) => v || 'SCHOOL_VISIT'),
  currentErp: empty,
  primaryObjection: empty,
  visitSummary: z.string().trim().min(5, 'Note what was discussed').max(4000),
  nextFollowUpAt: z
    .string()
    .trim()
    .min(8, 'Pick the next follow-up date')
    .superRefine((v, ctx) => {
      if (Number.isNaN(new Date(v).getTime())) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Pick a valid follow-up date' })
      }
    })
    .transform((v) => new Date(v)),
  nextAction: z.string().trim().min(2, 'Write the next action').max(200),
  stage: z.enum(CRM_STAGES).optional().or(z.literal('')).transform((v) => v || 'CONTACTED'),
  confirmDuplicate: optionalBool,
})
export type FieldCaptureInput = z.infer<typeof fieldCaptureSchema>
