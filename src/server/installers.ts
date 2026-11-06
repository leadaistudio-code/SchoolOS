import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'

/**
 * Windows installers schools run on their own PCs.
 *
 * Kept outside `public/` and served only to signed-in staff: an executable
 * anyone can fetch from the company domain is what ad-network and Safe
 * Browsing scanners flag as a compromised site.
 */
export const INSTALLERS = {
  connect: 'MyCampusView-Connect-Setup.exe',
  cctvRelay: 'MyCampusView-CCTV-Relay.exe',
} as const

export async function installerResponse(name: (typeof INSTALLERS)[keyof typeof INSTALLERS]): Promise<Response> {
  const file = path.join(process.cwd(), 'installers', name)
  const info = await stat(file).catch(() => null)
  if (!info?.isFile()) return new Response('Installer not available', { status: 404 })

  const body = Readable.toWeb(createReadStream(file)) as ReadableStream
  return new Response(body, {
    headers: {
      'Content-Type': 'application/vnd.microsoft.portable-executable',
      'Content-Length': String(info.size),
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  })
}
