import { z } from 'zod'
import { TeacherRefreshFrequency, TeacherRefreshType } from '@prisma/client'

export const updateTeacherRefreshConfigSchema = z.object({
  enabled: z.boolean().optional(),
  frequency: z.nativeEnum(TeacherRefreshFrequency).optional(),
  weeklyQuestionCount: z.number().int().min(1).max(50).optional(),
  monthlyQuestionCount: z.number().int().min(1).max(100).optional(),
  passingThreshold: z.number().min(0).max(100).optional(),
  maxAttempts: z.number().int().min(1).max(10).optional(),
  preLectureEnabled: z.boolean().optional(),
  preLectureCount: z.number().int().min(1).max(20).optional(),
  completionWindowHours: z.number().int().min(1).max(168).optional(),
})

export type UpdateTeacherRefreshConfigInput = z.infer<typeof updateTeacherRefreshConfigSchema>

/** A single submitted answer: which option indexes the teacher chose. */
export const refresherAnswerSchema = z.object({
  refreshQuestionId: z.string().min(1),
  selectedIndexes: z.array(z.number().int().min(0)).max(12).default([]),
})

export const submitRefresherSchema = z.object({
  answers: z.array(refresherAnswerSchema).max(200).default([]),
})

export type SubmitRefresherInput = z.infer<typeof submitRefresherSchema>

/**
 * A teacher (or the pre-lecture flow) asking for a refresher on demand. The
 * teacher may only name a subject they teach and topics within it; the service
 * re-checks both. `type` is limited to the on-demand kinds — WEEKLY/MONTHLY are
 * created by the scheduler, not requested by hand.
 */
export const composeRefresherSchema = z.object({
  classSubjectId: z.string().min(1),
  topicIds: z.array(z.string().min(1)).max(50).default([]),
  type: z
    .enum([TeacherRefreshType.PRE_LECTURE, TeacherRefreshType.MANUAL])
    .default(TeacherRefreshType.MANUAL),
  count: z.coerce.number().int().min(1).max(20).optional(),
})

export type ComposeRefresherInput = z.infer<typeof composeRefresherSchema>

/** Principal/admin exempting a teacher from a refresher, with a reason on record. */
export const exemptRefresherSchema = z.object({
  reason: z.string().trim().min(1).max(500),
})

export type ExemptRefresherInput = z.infer<typeof exemptRefresherSchema>

/** Principal/admin extending the completion window on a refresher. */
export const extendRefresherSchema = z.object({
  hours: z.coerce.number().int().min(1).max(336),
})

export type ExtendRefresherInput = z.infer<typeof extendRefresherSchema>
