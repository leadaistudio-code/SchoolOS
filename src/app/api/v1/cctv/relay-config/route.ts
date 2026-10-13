import { route } from '@/server/api/handler'
import { relayConfig } from '@/server/modules/cctv/service'

export const dynamic = 'force-dynamic'

/**
 * Downloads mediamtx.yml for the school PC. POST so the recorder password
 * travels in the body, never in a URL or an access log.
 */
export const POST = route(
  async (req, ctx) => {
    const form = await req.formData()
    const yaml = await relayConfig(ctx, {
      password: String(form.get('password') ?? ''),
      includeHd: form.get('includeHd') === 'on',
    })
    return new Response(yaml, {
      headers: {
        'Content-Type': 'text/yaml; charset=utf-8',
        'Content-Disposition': 'attachment; filename="mediamtx.yml"',
        'Cache-Control': 'no-store',
      },
    })
  },
  { permission: 'cctv.manage' },
)
