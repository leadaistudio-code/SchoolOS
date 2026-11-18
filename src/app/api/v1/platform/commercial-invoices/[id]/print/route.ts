import { platformRoute } from '@/server/api/handler'
import { renderInvoiceDocument } from '@/server/modules/platform/commercial-invoices'

/** Print-ready HTML — open in browser and use Print → Save as PDF. */
export const GET = platformRoute(
  async (_req, ctx, params) => {
    const html = await renderInvoiceDocument(ctx, params.id!)
    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    })
  },
  { permission: 'platform.billing' },
)
