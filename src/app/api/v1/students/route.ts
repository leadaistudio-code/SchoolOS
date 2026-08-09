import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok, paginationMeta } from '@/server/api/response'
import { listStudents, createStudent } from '@/server/modules/students/service'
import {
  studentCreateSchema,
  studentListFilterSchema,
} from '@/server/modules/students/schema'
import { parseListQuery } from '@/lib/query'

/**
 * GET /api/v1/students
 * Paginated, filterable, sortable. The same service the web UI uses, so a
 * future native app gets identical behaviour and identical authorization.
 */
export const GET = route(
  async (req: NextRequest, ctx) => {
    const params = req.nextUrl.searchParams
    const query = parseListQuery(params)
    const filter = studentListFilterSchema.parse(Object.fromEntries(params.entries()))
    const { rows, total } = await listStudents(ctx, query, filter)
    return ok(rows, paginationMeta(query.page, query.pageSize, total))
  },
  { permission: 'students.view' },
)

/** POST /api/v1/students */
export const POST = route(
  async (req: NextRequest, ctx) => {
    const body = await req.json()
    const input = studentCreateSchema.parse(body)
    const student = await createStudent(ctx, input)
    return ok(student, undefined, { status: 201 })
  },
  { permission: 'students.create', rateLimitKey: 'mutation' },
)
