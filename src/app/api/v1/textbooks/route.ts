import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ApiException, ok } from '@/server/api/response'
import { uploadTextbook } from '@/server/modules/questions/textbooks'

export const POST = route(
  async (req: NextRequest, ctx) => {
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      throw new ApiException(400, 'BAD_REQUEST', 'Choose a PDF textbook to upload')
    }

    const result = await uploadTextbook(ctx, file, {
      classSubjectId: String(form.get('classSubjectId') ?? ''),
      board: String(form.get('board') ?? ''),
      publisher: String(form.get('publisher') ?? ''),
      title: String(form.get('title') ?? ''),
      rightsConfirmed: String(form.get('rightsConfirmed') ?? ''),
    })
    return ok(result, undefined, { status: 201 })
  },
  { permission: 'questionbank.generate', rateLimitKey: 'mutation' },
)
