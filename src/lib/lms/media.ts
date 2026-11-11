/**
 * Lesson media is hosted elsewhere (YouTube, Vimeo, Google Drive) and shown in
 * an iframe. Only these hosts are turned into embeds; anything else is refused
 * for videos and opened as a plain link for documents.
 */

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/

function parse(raw: string): URL | null {
  try {
    const url = new URL(raw.trim())
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null
  } catch {
    return null
  }
}

/** Embed URL for a YouTube or Vimeo link, or null when it is neither. */
export function videoEmbedUrl(raw: string | null | undefined): string | null {
  if (!raw) return null
  const url = parse(raw)
  if (!url) return null
  const host = url.hostname.replace(/^www\.|^m\./, '')

  let youtube: string | null = null
  if (host === 'youtu.be') youtube = url.pathname.slice(1).split('/')[0] ?? null
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') youtube = url.searchParams.get('v')
    else {
      const [, kind, id] = url.pathname.split('/')
      if (kind === 'embed' || kind === 'shorts' || kind === 'live') youtube = id ?? null
    }
  }
  if (youtube && YOUTUBE_ID.test(youtube)) {
    const start = Number(url.searchParams.get('t')?.replace(/s$/, '') ?? url.searchParams.get('start') ?? 0)
    return `https://www.youtube-nocookie.com/embed/${youtube}?rel=0&modestbranding=1${start > 0 ? `&start=${Math.floor(start)}` : ''}`
  }

  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const parts = url.pathname.split('/').filter(Boolean)
    const id = parts.find((p) => /^\d+$/.test(p))
    if (!id) return null
    // Unlisted Vimeo videos carry a privacy hash after the id: vimeo.com/123/abcdef.
    const hashAfter = parts[parts.indexOf(id) + 1]
    const hash = url.searchParams.get('h') ?? (hashAfter && /^[a-f0-9]+$/i.test(hashAfter) ? hashAfter : null)
    return `https://player.vimeo.com/video/${id}${hash ? `?h=${hash}` : ''}`
  }
  return null
}

/** Inline preview for Google Drive / Docs / Slides links; otherwise null (show a link instead). */
export function documentEmbedUrl(raw: string | null | undefined): string | null {
  if (!raw) return null
  const url = parse(raw)
  if (!url) return null
  const host = url.hostname.replace(/^www\./, '')
  if (host === 'drive.google.com') {
    const match = url.pathname.match(/\/file\/d\/([^/]+)/)
    const id = match?.[1] ?? url.searchParams.get('id')
    return id ? `https://drive.google.com/file/d/${id}/preview` : null
  }
  if (host === 'docs.google.com') {
    const match = url.pathname.match(/^\/(document|presentation|spreadsheets)\/d\/([^/]+)/)
    if (!match) return null
    const [, kind, id] = match
    return kind === 'presentation'
      ? `https://docs.google.com/presentation/d/${id}/embed`
      : `https://docs.google.com/${kind}/d/${id}/preview`
  }
  return null
}

export function isHttpUrl(raw: string) {
  return parse(raw) !== null
}
