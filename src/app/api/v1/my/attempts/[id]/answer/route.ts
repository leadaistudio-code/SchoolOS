import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { answerSchema, saveAnswer } from '@/server/modules/assessments/attempts'

/** Autosave. Called on every change, so it stays cheap and idempotent. */
export const POST = route(
  async (req: NextRequest, ctx, params) => {
    const input = answerSchema.parse(await req.json())
    return ok(await saveAnswer(ctx, params.id!, input))
  },
  { permission: 'assessments.attempt' },
)
