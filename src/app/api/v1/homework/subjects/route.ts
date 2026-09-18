import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { teachableSubjects } from '@/server/modules/homework/service'

/** GET /api/v1/homework/subjects — classes/subjects the caller may set work for. */
export const GET = route(async (_req, ctx) => ok(await teachableSubjects(ctx)), {
  permission: 'homework.create',
})
