import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { marksRegister, marksRegisterFilterSchema } from '@/server/modules/exams/marks-register'
import { marksRegisterWorkbook } from '@/server/modules/exams/marks-register-xlsx'

/**
 * GET /api/v1/exams/marks-register/export?exam=&classLevelId=&sectionId=&status=
 *
 * Styled .xlsx of the principal's marks register: a completion summary sheet
 * plus one sheet per class-section, on the school letterhead.
 */
export const GET = route(
  async (req: NextRequest, ctx) => {
    const filters = marksRegisterFilterSchema.parse(Object.fromEntries(req.nextUrl.searchParams.entries()))
    const data = await marksRegister(ctx, filters, { perSection: true })
    if (!data.exam) return Response.json({ error: 'No exam with papers to export' }, { status: 404 })
    const buffer = await marksRegisterWorkbook(data)
    const slug = [data.exam?.name ?? 'marks', data.register?.className, data.register?.sectionName]
      .filter(Boolean)
      .join('-')
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase()
    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="marks-register-${slug || 'export'}.xlsx"`,
        'Cache-Control': 'no-store',
      },
    })
  },
  { permission: 'exams.marks' },
)
