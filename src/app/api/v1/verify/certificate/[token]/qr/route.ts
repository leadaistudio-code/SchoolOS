import QRCode from 'qrcode'
import { certificateVerifyUrl } from '@/server/modules/certificates/service'

export async function GET(
  _req: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params
  const url = certificateVerifyUrl(token)
  const png = await QRCode.toBuffer(url, { width: 240, margin: 1, type: 'png' })

  return new Response(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400',
    },
  })
}
