import { nextContext } from '@/server/context/next'
import { submitRefresherAttempt } from '@/server/modules/teacher-refresh/service'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const submitSchema = z.object({
  answers: z.array(z.object({
    refreshQuestionId: z.string(),
    selectedIndexes: z.array(z.number())
  }))
})

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await nextContext(req)
  const body = await req.json()
  const input = submitSchema.parse(body)
  const attempt = await submitRefresherAttempt(ctx, params.id, input.answers)
  return NextResponse.json(attempt)
}
