import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { listEvaluationJobs, listUploadTargets } from '@/server/modules/evaluation/service'

export const GET = route(
  async (req: NextRequest, ctx) => {
    const kind = req.nextUrl.searchParams.get('kind')
    if (kind === 'targets') {
      return ok(await listUploadTargets(ctx))
    }
    return ok(await listEvaluationJobs(ctx))
  },
  { permission: 'assessments.evaluate' },
)
