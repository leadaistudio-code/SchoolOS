import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok, ApiException } from '@/server/api/response'
import { enqueueSheetSchema, uploadAnswerSheet } from '@/server/modules/evaluation/service'

export const POST = route(
  async (req: NextRequest, ctx) => {
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      throw new ApiException(400, 'BAD_REQUEST', 'No file was uploaded')
    }
    const input = enqueueSheetSchema.parse({
      assignmentId: form.get('assignmentId'),
      studentId: form.get('studentId'),
      attemptId: form.get('attemptId') || undefined,
      pageCount: form.get('pageCount') || 1,
    })
    return ok(await uploadAnswerSheet(ctx, input, file))
  },
  { permission: 'assessments.evaluate', rateLimitKey: 'mutation' },
)
