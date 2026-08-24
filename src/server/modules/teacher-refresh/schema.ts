import { z } from 'zod'
import { TeacherRefreshFrequency } from '@prisma/client'

export const updateTeacherRefreshConfigSchema = z.object({
  enabled: z.boolean().optional(),
  frequency: z.nativeEnum(TeacherRefreshFrequency).optional(),
  weeklyQuestionCount: z.number().min(1).max(50).optional(),
  monthlyQuestionCount: z.number().min(1).max(100).optional(),
  passingThreshold: z.number().min(0).max(100).optional(),
  maxAttempts: z.number().min(1).max(10).optional(),
  preLectureEnabled: z.boolean().optional(),
  preLectureCount: z.number().min(1).max(20).optional(),
  completionWindowHours: z.number().min(1).max(168).optional(),
})

export type UpdateTeacherRefreshConfigInput = z.infer<typeof updateTeacherRefreshConfigSchema>
