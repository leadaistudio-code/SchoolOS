import { route } from '@/server/api/handler'
import { getMyKnowledgeProfile } from '@/server/modules/teacher-refresh/service'
import { ok } from '@/server/api/response'

/** The signed-in teacher's own topic-level knowledge profile. */
export const GET = route(
  async (_req, ctx) => {
    const data = await getMyKnowledgeProfile(ctx)
    return ok({ topics: data })
  },
  { permission: 'teacher_refresh.view_self' },
)
