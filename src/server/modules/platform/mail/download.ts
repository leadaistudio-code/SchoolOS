export const INLINE_SAFE = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])

/**
 * Attachment by default. `?view=1` opens PDFs and raster images in the browser;
 * every other type still downloads, so nothing uploaded can render as a page
 * in the application origin.
 */
export function fileResponse(
  req: Request,
  file: { body: Buffer; mimeType: string; fileName: string },
): Response {
  const inline = new URL(req.url).searchParams.get('view') === '1' && INLINE_SAFE.has(file.mimeType)
  const name = file.fileName.replace(/["\r\n\\]/g, '')
  const ascii = name.replace(/[^\x20-\x7e]/g, '_')
  return new Response(new Uint8Array(file.body), {
    headers: {
      'Content-Type': file.mimeType,
      'Content-Length': String(file.body.length),
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=300',
    },
  })
}
