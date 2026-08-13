import { NextResponse, type NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { exportResultsCsv } from '@/server/modules/exams/service'

export const GET = route(
  async (req: NextRequest, ctx) => {
    const examId = req.nextUrl.searchParams.get('exam')
    if (!examId) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: 'exam query parameter is required' } },
        { status: 400 },
      )
    }
    const csv = await exportResultsCsv(ctx, examId)
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="results-${examId}.csv"`,
      },
    })
  },
  { permission: 'results.export' },
)
