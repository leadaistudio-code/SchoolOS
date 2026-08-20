import { z } from 'zod'

const optionalString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === '' ? undefined : v))

const phone = z
  .string()
  .trim()
  .regex(/^[0-9+\-\s()]{7,20}$/, 'Enter a valid phone number')
  .optional()
  .transform((v) => (v === '' ? undefined : v))

/**
 * The single validation contract for a student. The API route, the server
 * action behind the form and the CSV importer all parse against this, so a
 * record created by any path is subject to exactly the same rules.
 */
export const studentCreateSchema = z.object({
  admissionNo: z
    .string()
    .trim()
    .min(1, 'Admission number is required')
    .max(40)
    .regex(/^[A-Za-z0-9/_-]+$/, 'Use letters, numbers, dash, slash or underscore only'),
  firstName: z.string().trim().min(1, 'First name is required').max(60),
  // Optional, and stored as an empty string rather than null: plenty of
  // children go by one name, and the column is non-null everywhere it is
  // read. `fullName()` trims, so a one-name student renders without a
  // trailing space.
  lastName: z.string().trim().max(60).default(''),
  dateOfBirth: z.coerce.date().max(new Date(), 'Date of birth cannot be in the future').optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  bloodGroup: optionalString(5),
  category: optionalString(40),
  religion: optionalString(40),
  nationality: optionalString(40),
  motherTongue: optionalString(40),

  admissionDate: z.coerce.date().optional(),
  previousSchool: optionalString(160),

  classLevelId: z.string().min(1, 'Select a class'),
  sectionId: z.string().min(1, 'Select a section'),
  rollNumber: z.coerce.number().int().positive().max(9999).optional(),

  addressLine1: optionalString(160),
  addressLine2: optionalString(160),
  city: optionalString(80),
  state: optionalString(80),
  postalCode: optionalString(12),

  emergencyContactName: optionalString(120),
  emergencyContactPhone: phone,
  medicalNotes: optionalString(600),
  allergies: optionalString(300),

  // Optional guardian created and linked in the same transaction as the
  // student, so an imported record is never left without a parent.
  guardian: z
    .object({
      firstName: z.string().trim().min(1).max(60),
      lastName: z.string().trim().min(1).max(60),
      relation: z.enum(['FATHER', 'MOTHER', 'GUARDIAN', 'OTHER']).default('GUARDIAN'),
      phone: phone,
      email: z.string().trim().email('Enter a valid email').optional().or(z.literal('')),
      occupation: optionalString(80),
      createLogin: z.boolean().default(false),
    })
    .optional(),
})

export type StudentCreateInput = z.infer<typeof studentCreateSchema>

export const studentUpdateSchema = studentCreateSchema
  .partial()
  .omit({ guardian: true })
  .extend({
    status: z.enum(['ACTIVE', 'ALUMNI', 'TRANSFERRED', 'WITHDRAWN', 'SUSPENDED']).optional(),
  })

export type StudentUpdateInput = z.infer<typeof studentUpdateSchema>

export const studentListFilterSchema = z.object({
  classLevelId: z.string().optional(),
  sectionId: z.string().optional(),
  status: z.enum(['ACTIVE', 'ALUMNI', 'TRANSFERRED', 'WITHDRAWN', 'SUSPENDED']).optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  hasDues: z.enum(['yes', 'no']).optional(),
})

export type StudentListFilter = z.infer<typeof studentListFilterSchema>

export const STUDENT_SORT_FIELDS = [
  'firstName',
  'lastName',
  'admissionNo',
  'createdAt',
  'status',
] as const

export const studentTransferSchema = z.object({
  studentIds: z.array(z.string().min(1)).min(1, 'Select at least one student'),
  sectionId: z.string().min(1, 'Select a target section'),
  reason: z.string().trim().max(300).optional(),
})

/**
 * What happens to one child at the end of a session.
 *
 * Modelled per student rather than per class because the exceptions are the
 * whole point: a class of forty moves up, two repeat, one has already left for
 * another city. A bulk "promote section A to section A" would force those
 * three to be corrected by hand afterwards, which is the manual work this
 * screen exists to remove.
 */
export const PROMOTION_DECISIONS = [
  'PROMOTE',
  'REPEAT',
  'GRADUATE',
  'TRANSFER_OUT',
  'SKIP',
] as const

export type PromotionDecision = (typeof PROMOTION_DECISIONS)[number]

export const promotionPlanSchema = z.object({
  fromSessionId: z.string().min(1, 'Choose the session to promote from'),
  toSessionId: z.string().min(1, 'Choose the session to promote into'),
  fromClassLevelId: z.string().min(1, 'Choose a class'),
  fromSectionId: z.string().optional(),
})

export type PromotionPlanInput = z.infer<typeof promotionPlanSchema>

/**
 * Roll numbers in the receiving section.
 *
 * `continue` never touches a roll already issued in the target section, so a
 * section that has taken students from two different classes does not have the
 * first batch renumbered when the second arrives.
 */
export const ROLL_POLICIES = ['continue', 'keep'] as const

export const promotionApplySchema = z
  .object({
    fromSessionId: z.string().min(1),
    toSessionId: z.string().min(1),
    rollPolicy: z.enum(ROLL_POLICIES).default('continue'),
    decisions: z
      .array(
        z.object({
          studentId: z.string().min(1),
          decision: z.enum(PROMOTION_DECISIONS),
          toClassLevelId: z.string().optional(),
          toSectionId: z.string().optional(),
        }),
      )
      .min(1, 'Nothing to apply')
      // A single class is the unit of work here. The cap is a guard against a
      // crafted request, not a limit a real section ever reaches.
      .max(500, 'Promote one class at a time'),
  })
  .refine((v) => v.fromSessionId !== v.toSessionId, {
    path: ['toSessionId'],
    message: 'Promote into a different session from the one you are promoting out of',
  })

export type PromotionApplyInput = z.infer<typeof promotionApplySchema>

/** Uploading one paper against one student. */
export const studentDocumentCreateSchema = z.object({
  studentId: z.string().min(1, 'Choose a student'),
  category: z.string().trim().min(1, 'Choose a document type').max(60),
  title: z.string().trim().min(1, 'Give the document a name').max(160),
  // Date-only, and only meaningful for the few categories that go stale.
  expiresOn: z.coerce.date().optional(),
})

export type StudentDocumentCreateInput = z.infer<typeof studentDocumentCreateSchema>

export const studentDocumentFilterSchema = z.object({
  studentId: z.string().optional(),
  category: z.string().optional(),
  classLevelId: z.string().optional(),
  sectionId: z.string().optional(),
  verified: z.enum(['yes', 'no']).optional(),
  expiry: z.enum(['expired', 'soon']).optional(),
})

export type StudentDocumentFilter = z.infer<typeof studentDocumentFilterSchema>

export const STUDENT_DOCUMENT_SORT_FIELDS = ['createdAt', 'title', 'category'] as const
