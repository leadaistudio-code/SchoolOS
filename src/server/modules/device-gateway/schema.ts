import { z } from 'zod'

export const PAIRING_CODE_TTL_MINUTES = 30
export const CONNECTOR_OFFLINE_AFTER_SEC = 5 * 60
export const DEFAULT_DUPLICATE_PUNCH_WINDOW_SEC = 30
export const DEFAULT_STUDENT_LATE_AFTER_MINUTES = 9 * 60 // 09:00 local wall in minutes from midnight
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
  staffId: z.string().min(1).optional().nullable(),
  deviceId: z.string().min(1).optional().nullable(),
  connectorId: z.string().min(1).optional().nullable(),
  active: z.boolean().optional(),
})

export const biometricSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  studentAttendance: z.boolean().default(true),
  staffAttendance: z.boolean().default(true),
  notifyParentOnEntry: z.boolean().default(false),
  notifyParentOnExit: z.boolean().default(false),
  duplicatePunchWindowSec: z.number().int().min(0).max(600).default(DEFAULT_DUPLICATE_PUNCH_WINDOW_SEC),
  studentLateAfterMinutes: z
    .number()
    .int()
    .min(0)
    .max(24 * 60)
    .default(DEFAULT_STUDENT_LATE_AFTER_MINUTES),
  requireManualConflictReview: z.boolean().default(true),
  autoProcess: z.boolean().default(true),
})

export type BiometricSettings = z.infer<typeof biometricSettingsSchema>
