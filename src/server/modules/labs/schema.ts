import { z } from 'zod'

const optionalText = (max: number) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), z.string().trim().max(max).optional())

const optionalId = z.preprocess((v) => (v === '' || v === null ? undefined : v), z.string().min(1).optional())

const number = (opts: { min?: number; max?: number } = {}) =>
  z.coerce.number({ invalid_type_error: 'Enter a number' }).min(opts.min ?? 0, 'Too small').max(opts.max ?? 1_000_000, 'Too large')

const optionalNumber = (opts: { min?: number; max?: number } = {}) =>
  z.preprocess((v) => (v === '' || v === null || v === undefined ? undefined : v), number(opts).optional())

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date')
const optionalDate = z.preprocess((v) => (v === '' ? undefined : v), isoDate.optional())
const hhmm = z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM')

export const labTypeSchema = z.enum(['COMPOSITE_SCIENCE', 'ROBOTICS_AI', 'PHYSICS', 'CHEMISTRY', 'BIOLOGY', 'COMPUTER', 'MATHEMATICS', 'OTHER'])

export const emergencyContactSchema = z.object({
  label: z.string().trim().min(1).max(60),
  phone: z.string().trim().min(3).max(30),
})

export const createLabSchema = z.object({
  name: z.string().trim().min(2, 'Name the lab').max(80),
  type: labTypeSchema,
  room: optionalText(60),
  inChargeStaffId: optionalId,
  assistantStaffId: optionalId,
  /** Load the template's required item list into the register (opening stock 0). */
  loadItems: z.boolean().default(true),
  /** Load the template practicals into the library if none exist for this lab type. */
  loadPracticals: z.boolean().default(true),
})

export const updateLabSchema = z.object({
  name: z.string().trim().min(2).max(80),
  room: optionalText(60),
  inChargeStaffId: optionalId,
  assistantStaffId: optionalId,
  notes: optionalText(1000),
  emergencyContacts: z.array(emergencyContactSchema).max(8).default([]),
})

export const infraAnswerSchema = z.object({
  ok: z.boolean(),
  value: z.number().min(0).max(100000).optional(),
  note: z.string().max(200).optional(),
})
export const infrastructureSchema = z.record(z.string().max(40), infraAnswerSchema)

export const itemCategorySchema = z.enum([
  'APPARATUS', 'GLASSWARE', 'INSTRUMENT', 'CHEMICAL', 'SPECIMEN', 'SLIDE', 'CHART', 'CONSUMABLE', 'SAFETY', 'EQUIPMENT',
])
export const hazardSchema = z.enum(['FLAMMABLE', 'CORROSIVE', 'TOXIC', 'OXIDISER', 'IRRITANT'])

export const labItemSchema = z.object({
  name: z.string().trim().min(2, 'Name the item').max(120),
  category: itemCategorySchema,
  kind: z.enum(['NON_CONSUMABLE', 'CONSUMABLE']),
  unit: z.string().trim().min(1, 'Unit, e.g. pcs, ml, g').max(20),
  requiredQty: number().default(0),
  reorderLevel: number().default(0),
  storageLocation: optionalText(80),
  hazards: z.array(hazardSchema).default([]),
  expiresOn: optionalDate,
  unitCostMinor: z.coerce.number().int().min(0).max(100_000_000).default(0),
  notes: optionalText(500),
})

export const newLabItemSchema = labItemSchema.extend({
  openingQty: number().default(0),
})

export const movementSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('PURCHASE'),
    itemId: z.string().min(1),
    quantity: number().refine((n) => n > 0, 'Enter the quantity received'),
    unitCostMinor: z.coerce.number().int().min(0).default(0),
    vendorName: optionalText(120),
    invoiceNo: optionalText(60),
    expiresOn: optionalDate,
    reason: optionalText(300),
  }),
  z.object({
    type: z.literal('ADJUSTMENT'),
    itemId: z.string().min(1),
    /** The physically counted quantity; the ledger records the difference. */
    countedQty: number(),
    reason: z.string().trim().min(3, 'Say why the count differs').max(300),
  }),
  z.object({
    type: z.literal('BREAKAGE'),
    itemId: z.string().min(1),
    quantity: number().refine((n) => n > 0, 'Enter how many broke'),
    studentId: optionalId,
    chargeMinor: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().int().min(0).optional()),
    sessionId: optionalId,
    reason: optionalText(300),
  }),
  z.object({
    type: z.literal('DISPOSAL'),
    itemId: z.string().min(1),
    quantity: number().refine((n) => n > 0, 'Enter the quantity written off'),
    reason: z.string().trim().min(3, 'Say why it is written off (expired, damaged…)').max(300),
  }),
])
export type MovementInput = z.infer<typeof movementSchema>

export const experimentSchema = z.object({
  labType: labTypeSchema,
  classNumber: optionalNumber({ min: 1, max: 12 }),
  subject: optionalText(40),
  title: z.string().trim().min(3, 'Give the practical a title').max(160),
  aim: optionalText(1000),
  safetyNotes: optionalText(500),
  apparatus: z
    .array(z.object({ itemCode: z.string().min(1).max(60), qty: z.number().min(0).max(100000) }))
    .max(40)
    .default([]),
})

export const bookSessionSchema = z.object({
  labId: z.string().min(1, 'Pick a lab'),
  experimentId: optionalId,
  sectionId: z.string().min(1, 'Pick a class'),
  teacherStaffId: optionalId,
  date: isoDate,
  periodId: optionalId,
  startTime: z.preprocess((v) => (v === '' ? undefined : v), hhmm.optional()),
  endTime: z.preprocess((v) => (v === '' ? undefined : v), hhmm.optional()),
  batch: optionalText(40),
  notes: optionalText(500),
})

export const completeSessionSchema = z.object({
  sessionId: z.string().min(1),
  attendance: z
    .array(
      z.object({
        studentId: z.string().min(1),
        present: z.boolean(),
        recordDone: z.boolean().default(false),
        marks: z.number().min(0).max(100).nullable().optional(),
        remarks: z.string().max(200).optional(),
      }),
    )
    .max(200),
  /** Consumables actually used; defaults to the practical's apparatus list. */
  consumption: z.array(z.object({ itemId: z.string().min(1), qty: z.number().min(0).max(100000) })).max(60),
  breakages: z
    .array(
      z.object({
        itemId: z.string().min(1),
        qty: z.number().positive().max(1000),
        studentId: z.string().optional(),
        chargeMinor: z.number().int().min(0).optional(),
      }),
    )
    .max(40)
    .default([]),
  notes: z.string().max(1000).optional(),
})
export type CompleteSessionInput = z.infer<typeof completeSessionSchema>

export const inspectionSchema = z.object({
  labId: z.string().min(1),
  type: z.enum(['DAILY', 'MONTHLY', 'QUARTERLY']),
  inspectedOn: isoDate,
  checklist: z.record(z.string().max(40), z.boolean()),
  issues: z.string().max(1000).optional(),
  inspectorName: z.string().max(120).optional(),
})

export const incidentSchema = z.object({
  labId: z.string().min(1, 'Pick a lab'),
  occurredAt: z.string().min(1, 'When did it happen?'),
  type: z.enum(['INJURY', 'BURN', 'CHEMICAL_SPILL', 'CHEMICAL_EXPOSURE', 'FIRE', 'GAS_LEAK', 'ELECTRICAL', 'BREAKAGE', 'OTHER']),
  severity: z.enum(['MINOR', 'MODERATE', 'SERIOUS']),
  description: z.string().trim().min(5, 'Describe what happened').max(2000),
  studentIds: z.array(z.string()).max(40).default([]),
  firstAidGiven: z.boolean().default(false),
  parentInformed: z.boolean().default(false),
  actionTaken: optionalText(1000),
})

export const closeIncidentSchema = z.object({
  incidentId: z.string().min(1),
  actionTaken: z.string().trim().min(3, 'Record the action taken').max(1000),
  parentInformed: z.boolean().default(false),
})

export const wasteSchema = z.object({
  labId: z.string().min(1),
  disposedOn: isoDate,
  category: z.enum(['BIODEGRADABLE', 'NON_BIODEGRADABLE', 'BROKEN_GLASS', 'CHEMICAL', 'FLAMMABLE_BOTTLES', 'EMPTY_CONTAINERS', 'E_WASTE', 'BATTERIES']),
  quantity: optionalNumber(),
  unit: optionalText(20),
  handedTo: optionalText(120),
  notes: optionalText(500),
})
