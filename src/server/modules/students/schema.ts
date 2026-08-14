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

export const studentPromoteSchema = z.object({
  fromSectionId: z.string().min(1),
  toSessionId: z.string().min(1),
  toSectionId: z.string().min(1),
  studentIds: z.array(z.string().min(1)).min(1, 'Select at least one student'),
  markGraduating: z.boolean().default(false),
})
