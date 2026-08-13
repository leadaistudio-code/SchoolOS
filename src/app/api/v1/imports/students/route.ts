import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ApiException, ok } from '@/server/api/response'
import {
  listStudentImports,
  sampleOnboardingPack,
  sampleStudentCsv,
  uploadStudentImport,
} from '@/server/modules/imports/service'
import { ONBOARDING_PACK_FILENAME } from '@/server/modules/imports/onboarding-pack'

export const GET = route(
  async (req: NextRequest, ctx) => {
    const url = new URL(req.url)
    if (url.searchParams.get('sample') === 'pack') {
      const body = sampleOnboardingPack()
      return new Response(new Uint8Array(body), {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${ONBOARDING_PACK_FILENAME}"`,
        },
      })
    }
    if (url.searchParams.get('sample') === '1') {
      return new Response(sampleStudentCsv(), {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="student-import-template.csv"',
        },
      })
    }
    const batches = await listStudentImports(ctx)
    return ok(batches)
  },
  { permission: 'students.import' },
)

export const POST = route(
  async (req: NextRequest, ctx) => {
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File) || file.size === 0) {
      throw new ApiException(400, 'BAD_REQUEST', 'Choose a CSV or Excel file to upload')
    }
    const useAi = form.get('smartImport') === 'true'
    const batch = await uploadStudentImport(ctx, file, { useAi })
    return ok(batch, undefined, { status: 201 })
  },
  { permission: 'students.import', rateLimitKey: 'mutation' },
)
