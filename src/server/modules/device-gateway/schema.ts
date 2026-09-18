import { z } from 'zod'

export const PAIRING_CODE_TTL_MINUTES = 30
export const CONNECTOR_OFFLINE_AFTER_SEC = 5 * 60
export const DEFAULT_DUPLICATE_PUNCH_WINDOW_SEC = 30
export const DEFAULT_SCHOOL_OPEN_MINUTES = 8 * 60 // 08:00
export const DEFAULT_SCHOOL_CLOSE_MINUTES = 14 * 60 // 14:00
export const DEFAULT_STUDENT_LATE_AFTER_MINUTES = 9 * 60 // 09:00 local wall in minutes from midnight
export const DEFAULT_STAFF_LATE_AFTER_MINUTES = 8 * 60 // 08:00 — aligned with school open
export const DEFAULT_ATTENDANCE_WINDOW_GRACE_MINUTES = 30
export const MAX_EVENT_BATCH = 500
export const TOKEN_PREFIX = 'mcv_conn_'

export const pairRequestSchema = z.object({
  code: z.string().trim().min(6).max(32),
  hostname: z.string().trim().max(120).optional(),
  osInfo: z.string().trim().max(120).optional(),
  connectorVersion: z.string().trim().max(40).optional(),
  name: z.string().trim().max(80).optional(),
})

export const heartbeatSchema = z.object({
  connectorVersion: z.string().trim().max(40).optional(),
  hostname: z.string().trim().max(120).optional(),
  osInfo: z.string().trim().max(120).optional(),
  devices: z.number().int().min(0).max(10_000).optional(),
  pendingEvents: z.number().int().min(0).max(10_000_000).optional(),
})

export const deviceUpsertSchema = z.object({
  localDeviceId: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(120),
  brand: z.string().trim().min(1).max(60),
  model: z.string().trim().min(1).max(60),
  locationLabel: z.string().trim().max(120).optional().nullable(),
  purpose: z.enum(['STUDENT', 'STAFF', 'BOTH', 'ACCESS_ONLY']).default('BOTH'),
  serialNumber: z.string().trim().max(120).optional().nullable(),
  machineNumber: z.string().trim().max(60).optional().nullable(),
  networkAddress: z.string().trim().max(120).optional().nullable(),
  port: z.number().int().min(1).max(65535).optional().nullable(),
  connectionPassword: z.string().trim().max(200).optional().nullable(),
  firmware: z.string().trim().max(80).optional().nullable(),
  userCount: z.number().int().min(0).optional().nullable(),
  status: z.enum(['ONLINE', 'OFFLINE', 'SYNCING', 'ERROR', 'DISABLED']).optional(),
  lastError: z.string().trim().max(500).optional().nullable(),
  clockDriftSec: z.number().int().optional().nullable(),
  syncEnabled: z.boolean().optional(),
})

export const rawEventSchema = z.object({
  localDeviceId: z.string().trim().min(1).max(120),
  externalUserId: z.string().trim().min(1).max(120),
  deviceLocalAt: z.string().datetime({ offset: true }).or(z.string().datetime()),
  verificationMethod: z
    .enum(['FINGERPRINT', 'RFID', 'PIN', 'FACE', 'UNKNOWN'])
    .default('UNKNOWN'),
  direction: z.enum(['IN', 'OUT', 'UNKNOWN']).default('UNKNOWN'),
  deviceEventId: z.string().trim().max(120).optional().nullable(),
  dedupeKey: z.string().trim().min(1).max(240).optional(),
  rawPayload: z.record(z.string(), z.unknown()).optional().nullable(),
})

export const eventBatchSchema = z.object({
  events: z.array(rawEventSchema).min(1).max(MAX_EVENT_BATCH),
})

export const commandResultSchema = z.object({
  status: z.enum(['SUCCEEDED', 'FAILED']),
  result: z.record(z.string(), z.unknown()).optional().nullable(),
  error: z.string().trim().max(1000).optional().nullable(),
})

export const createPairingSchema = z.object({
  connectorName: z.string().trim().min(1).max(80).default('Office Connector'),
})

export const mappingSchema = z.object({
  externalUserId: z.string().trim().min(1).max(120),
  displayName: z.string().trim().max(120).optional().nullable(),
  subjectType: z.enum(['STUDENT', 'STAFF']),
  studentId: z.string().min(1).optional().nullable(),
  /** Prefer this in the UI — resolved to studentId server-side. */
  admissionNo: z.string().trim().min(1).max(80).optional().nullable(),
  staffId: z.string().min(1).optional().nullable(),
  /** Prefer this for staff — resolved to staffId server-side. */
  employeeCode: z.string().trim().min(1).max(80).optional().nullable(),
  deviceId: z.string().min(1).optional().nullable(),
  connectorId: z.string().min(1).optional().nullable(),
  active: z.boolean().optional(),
})

export const createCloudBiometricDeviceSchema = z.object({
  name: z.string().trim().min(2).max(100),
  cloudId: z.string().trim().min(4).max(120),
  purpose: z.enum(['STUDENT', 'STAFF', 'BOTH']).default('BOTH'),
  locationLabel: z.string().trim().max(120).optional().nullable(),
})

export const biometricSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  studentAttendance: z.boolean().default(true),
  staffAttendance: z.boolean().default(true),
  notifyParentOnEntry: z.boolean().default(false),
  notifyParentOnExit: z.boolean().default(false),
  duplicatePunchWindowSec: z.number().int().min(0).max(600).default(DEFAULT_DUPLICATE_PUNCH_WINDOW_SEC),
  /** School day open — minutes from midnight in the tenant timezone. */
  schoolOpenMinutes: z
    .number()
    .int()
    .min(0)
    .max(24 * 60 - 1)
    .default(DEFAULT_SCHOOL_OPEN_MINUTES),
  /** School day close — minutes from midnight in the tenant timezone. */
  schoolCloseMinutes: z
    .number()
    .int()
    .min(0)
    .max(24 * 60 - 1)
    .default(DEFAULT_SCHOOL_CLOSE_MINUTES),
  studentLateAfterMinutes: z
    .number()
    .int()
    .min(0)
    .max(24 * 60)
    .default(DEFAULT_STUDENT_LATE_AFTER_MINUTES),
  staffLateAfterMinutes: z
    .number()
    .int()
    .min(0)
    .max(24 * 60)
    .default(DEFAULT_STAFF_LATE_AFTER_MINUTES),
  /** When true, punches outside school (or staff custom) hours ± grace are ignored for attendance. */
  enforceAttendanceWindow: z.boolean().default(true),
  attendanceWindowGraceMinutes: z
    .number()
    .int()
    .min(0)
    .max(180)
    .default(DEFAULT_ATTENDANCE_WINDOW_GRACE_MINUTES),
  requireManualConflictReview: z.boolean().default(true),
  autoProcess: z.boolean().default(true),
}).superRefine((value, context) => {
  if (value.schoolCloseMinutes <= value.schoolOpenMinutes) {
    context.addIssue({
      code: 'custom',
      path: ['schoolCloseMinutes'],
      message: 'School end time must be after school open time',
    })
  }
})

export type BiometricSettings = z.infer<typeof biometricSettingsSchema>
