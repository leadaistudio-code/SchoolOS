import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { badRequest, ok } from '@/server/api/response'
import {
  examAttendanceMarkSchema,
  examAttendanceScanSchema,
  getExamAttendanceDesk,
  markExamAttendance,
  scanExamAttendance,
} from '@/server/modules/exams/attendance'

/**
 * GET /api/v1/exams/:id/attendance?examDate=
 * The date-based attendance desk — papers that day and each eligible student.
 */
export const GET = route(
  async (req: NextRequest, ctx, params) => {
    if (!params.id) throw badRequest('Exam id is required')
    const examDate = req.nextUrl.searchParams.get('examDate') ?? undefined
    return ok(await getExamAttendanceDesk(ctx, params.id, examDate))
  },
  { permission: 'exams.attendance' },
)

/**
 * POST — either scan a barcode (`barcode`) or mark one student present/absent
 * (`studentId` + `status`). Same service layer the web desk uses.
 */
export const POST = route(
  async (req: NextRequest, ctx, params) => {
    if (!params.id) throw badRequest('Exam id is required')
    const body = await req.json()
    const payload = { ...(body as object), examId: params.id }

    if (typeof (body as { barcode?: unknown }).barcode === 'string') {
      return ok(await scanExamAttendance(ctx, examAttendanceScanSchema.parse(payload)))
    }

    return ok(await markExamAttendance(ctx, examAttendanceMarkSchema.parse(payload)))
  },
  { permission: 'exams.attendance', rateLimitKey: 'mutation' },
)
