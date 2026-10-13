import sanitizeHtml from 'sanitize-html'

/** An attachment that may be shown inline in the message body via cid: */
export type InlineImage = { contentId: string | null; contentType: string; content: Buffer }

export type AddressLike = { name?: string | null; address?: string | null }

const MAX_INLINE_IMAGE_BYTES = 2 * 1024 * 1024
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

const TABLE_ATTRS = ['width', 'height', 'align', 'valign', 'bgcolor', 'border', 'cellpadding', 'cellspacing', 'background']

/**
 * Received mail is hostile input. It is cleaned to an allowlist here and is
 * then shown in an iframe with no scripts, no same-origin access and a CSP
 * that blocks every network fetch except, on request, remote images.
 */
export function prepareIncomingHtml(
  html: string,
  opts: { inlineImages: InlineImage[]; allowRemoteImages: boolean },
): { document: string; hasRemoteImages: boolean } {
  const cids = new Map<string, string>()
  for (const img of opts.inlineImages) {
    if (!img.contentId || !img.contentType.startsWith('image/') || img.content.length > MAX_INLINE_IMAGE_BYTES) continue
    cids.set(img.contentId.replace(/^<|>$/g, '').toLowerCase(), `data:${img.contentType};base64,${img.content.toString('base64')}`)
  }

  const clean = sanitizeHtml(html, {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      'img', 'font', 'center', 'span', 'div', 'u', 's', 'strike', 'sub', 'sup', 'small', 'big',
      'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'colgroup', 'col', 'style',
    ],
    // <style> blocks carry most newsletter and signature layout. They cannot run
    // code, and url() fetches are stopped by the frame's CSP.
    allowVulnerableTags: true,
    allowedAttributes: {
      '*': ['style', 'class', 'dir', 'lang', 'title', 'align'],
      a: ['href', 'name'],
      img: ['src', 'alt', 'width', 'height'],
      font: ['color', 'face', 'size'],
      table: TABLE_ATTRS,
      td: [...TABLE_ATTRS, 'colspan', 'rowspan', 'nowrap'],
      th: [...TABLE_ATTRS, 'colspan', 'rowspan', 'nowrap', 'scope'],
      tr: TABLE_ATTRS,
      col: ['width', 'span'],
      colgroup: ['width', 'span'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['http', 'https', 'data', 'cid'] },
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, target: '_blank', rel: 'noopener noreferrer nofollow' },
      }),
      img: (tagName, attribs) => {
        const src = attribs.src ?? ''
        if (src.toLowerCase().startsWith('cid:')) {
          const inline = cids.get(src.slice(4).replace(/^<|>$/g, '').toLowerCase())
          return { tagName, attribs: { ...attribs, src: inline ?? '' } }
        }
        return { tagName, attribs }
      },
    },
  })

  const hasRemoteImages = /<img[^>]+src="https?:/i.test(clean) || /url\(\s*['"]?https?:/i.test(clean)
  const imgSrc = opts.allowRemoteImages ? 'data: https: http:' : 'data:'
  const csp = `default-src 'none'; style-src 'unsafe-inline'; img-src ${imgSrc}; font-src data:`

  const document = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<base target="_blank">
<style>body{margin:0;padding:20px 24px;font-family:${FONT};font-size:14px;line-height:1.55;color:#1f2937;background:#fff;overflow-wrap:anywhere}img{max-width:100%;height:auto}pre{white-space:pre-wrap}blockquote{margin:0 0 0 4px;padding-left:12px;border-left:3px solid #e5e7eb;color:#4b5563}a{color:#2563eb}</style>
</head><body>${clean}</body></html>`
  return { document, hasRemoteImages }
}

function escapeHtml(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Plain text as editor paragraphs, so a quote survives the compose sanitiser intact. */
export function textToParagraphs(text: string, maxChars = 20_000): string {
  const trimmed = text.replace(/\r\n/g, '\n').trim()
  const body = trimmed.length > maxChars ? `${trimmed.slice(0, maxChars)}\n\n[…]` : trimmed
  return body
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

export function formatAddress(a: AddressLike): string {
  if (!a.address) return a.name ?? ''
  return a.name && a.name !== a.address ? `${a.name} <${a.address}>` : a.address
}

function stripPrefixes(subject: string) {
  return subject.replace(/^\s*((re|fwd?|aw|wg)\s*:\s*)+/i, '').trim()
}

export function replySubject(subject: string) {
  return `Re: ${stripPrefixes(subject) || '(no subject)'}`
}

export function forwardSubject(subject: string) {
  return `Fwd: ${stripPrefixes(subject) || '(no subject)'}`
}

const QUOTE_DATE: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }

/** "On 6 Oct 2026, 8:09 pm, Anita Sharma <anita@school.in> wrote:" followed by the quoted text. */
export function replyQuote(original: { from: AddressLike | null; date: Date | null; text: string }): string {
  const who = original.from ? escapeHtml(formatAddress(original.from)) : 'the sender'
  const when = original.date ? `${original.date.toLocaleString('en-IN', QUOTE_DATE)}, ` : ''
  return `<p><br></p><p>On ${when}${who} wrote:</p><blockquote>${textToParagraphs(original.text)}</blockquote>`
}

export function forwardQuote(original: {
  from: AddressLike | null
  to: AddressLike[]
  cc: AddressLike[]
  date: Date | null
  subject: string
  text: string
}): string {
  const lines = [
    `From: ${original.from ? formatAddress(original.from) : ''}`,
    original.date ? `Date: ${original.date.toLocaleString('en-IN', QUOTE_DATE)}` : null,
    `Subject: ${original.subject}`,
    original.to.length ? `To: ${original.to.map(formatAddress).join(', ')}` : null,
    original.cc.length ? `Cc: ${original.cc.map(formatAddress).join(', ')}` : null,
  ].filter((l): l is string => !!l)
  return `<p><br></p><p>---------- Forwarded message ----------<br>${lines.map(escapeHtml).join('<br>')}</p>${textToParagraphs(original.text)}`
}

/** References chain for a reply: the original's references plus its own Message-ID. */
export function replyReferences(messageId: string | null, references: string | string[] | undefined): string[] {
  const prior = Array.isArray(references) ? references : references ? references.split(/\s+/) : []
  const chain = [...prior.filter(Boolean), ...(messageId ? [messageId] : [])]
  return Array.from(new Set(chain)).slice(-20)
}
