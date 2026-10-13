import sanitizeHtml from 'sanitize-html'
import { DEMO_URL, WEBSITE_URL, type MailLayout } from '@/lib/platform-mail'

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
const NAVY = '#002046'
const ORANGE = '#f45a1e'
const INK = '#0a1024'
const BODY = '#3d4759'
const MUTED = '#5b6577'
const LOGO_URL = 'https://www.mycampusview.com/brand/mycampusview-lockup.png'

export type MailSignature = {
  name: string | null
  title: string | null
  phone: string | null
  email: string
  website: string | null
}

/**
 * Editor HTML is untrusted: it comes from a contentEditable surface and from
 * whatever was pasted into it. Only structural tags survive, links are limited
 * to web, mail and phone schemes, and every attribute except href is dropped.
 */
export function sanitizeMailBody(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ['p', 'br', 'strong', 'em', 'u', 's', 'ul', 'ol', 'li', 'a', 'h2', 'h3', 'blockquote', 'hr'],
    allowedAttributes: { a: ['href'] },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    transformTags: {
      div: 'p',
      b: 'strong',
      i: 'em',
      strike: 's',
      h1: 'h2',
      h4: 'h3',
    },
  })
    // A link whose href was refused keeps its words but stops being a link.
    .replace(/<a>([\s\S]*?)<\/a>/g, '$1')
    .trim()
}

/** Email clients ignore most <style> blocks, so every element carries its own. */
export function inlineMailStyles(html: string, layout: MailLayout): string {
  const text = layout === 'PLAIN' ? '#222222' : BODY
  const strong = layout === 'PLAIN' ? '#111111' : INK
  const styles: Record<string, string> = {
    p: `margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:24px;color:${text};`,
    ul: `margin:0 0 18px;padding:0 0 0 22px;color:${text};`,
    ol: `margin:0 0 18px;padding:0 0 0 22px;color:${text};`,
    li: `margin:0 0 8px;font-family:${FONT};font-size:15px;line-height:23px;color:${text};`,
    h2: `margin:6px 0 12px;font-family:${FONT};font-size:19px;line-height:26px;font-weight:700;color:${strong};`,
    h3: `margin:4px 0 10px;font-family:${FONT};font-size:16px;line-height:23px;font-weight:700;color:${strong};`,
    blockquote: `margin:0 0 16px;padding:12px 16px;border-left:3px solid ${ORANGE};background-color:#f7f8fb;color:${text};`,
    strong: `font-weight:700;color:${strong};`,
    a: `color:${NAVY};font-weight:600;text-decoration:underline;`,
    hr: 'border:0;border-top:1px solid #eceef3;margin:20px 0;',
  }
  return html.replace(
    /<(p|ul|ol|li|h2|h3|blockquote|strong|a|hr)(\s[^>]*)?(\/?)>/g,
    (_m, tag: string, attrs: string | undefined, selfClose: string) =>
      `<${tag}${attrs ?? ''} style="${styles[tag]}"${selfClose}>`,
  )
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
  '&nbsp;': ' ',
}

/** A readable plain-text alternative; spam filters penalise HTML-only mail. */
export function mailHtmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h2|h3|blockquote|ul|ol)>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<hr[^>]*>/gi, '\n————\n')
    .replace(/<a [^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, label: string) => {
      const plain = label.replace(/<[^>]+>/g, '').trim()
      const target = href.replace(/^mailto:/, '')
      return plain === target || !plain ? target : `${plain} (${target})`
    })
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|nbsp|#39|#x27);/g, (e) => ENTITIES[e] ?? e)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function websiteHref(raw: string): string {
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
}

function websiteLabel(raw: string): string {
  return raw.replace(/^https?:\/\//i, '').replace(/\/$/, '')
}

function signatureHtml(sig: MailSignature, layout: MailLayout): string {
  const strong = layout === 'PLAIN' ? '#111111' : INK
  const muted = layout === 'PLAIN' ? '#555555' : MUTED
  const link = `color:${NAVY};font-weight:600;text-decoration:none;`
  const contacts = [
    sig.phone ? `<a href="tel:${esc(sig.phone.replace(/[^\d+]/g, ''))}" style="${link}">${esc(sig.phone)}</a>` : null,
    `<a href="mailto:${esc(sig.email)}" style="${link}">${esc(sig.email)}</a>`,
    sig.website
      ? `<a href="${esc(websiteHref(sig.website))}" style="${link}">${esc(websiteLabel(sig.website))}</a>`
      : null,
  ].filter(Boolean)
  return `<p style="margin:0 0 4px;font-family:${FONT};font-size:15px;line-height:22px;color:${muted};">Warm regards,</p>
${sig.name ? `<p style="margin:0 0 2px;font-family:${FONT};font-size:16px;line-height:23px;font-weight:700;color:${strong};">${esc(sig.name)}</p>` : ''}
${sig.title ? `<p style="margin:0 0 2px;font-family:${FONT};font-size:14px;line-height:21px;color:${muted};">${esc(sig.title)}</p>` : ''}
<p style="margin:0;font-family:${FONT};font-size:14px;line-height:21px;">${contacts.join(`<span style="color:#a0a7b4;">&nbsp;·&nbsp;</span>`)}</p>`
}

export function signatureText(sig: MailSignature): string {
  return [
    'Warm regards,',
    sig.name,
    sig.title,
    [sig.phone, sig.email, sig.website ? websiteLabel(sig.website) : null].filter(Boolean).join(' · '),
  ]
    .filter(Boolean)
    .join('\n')
}

function demoButtonHtml(): string {
  return `<table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:4px 0 22px;">
  <tr>
    <td bgcolor="${ORANGE}" style="background-color:${ORANGE};border-radius:8px;">
      <a href="${DEMO_URL}" style="display:inline-block;padding:13px 26px;font-family:${FONT};font-size:15px;font-weight:600;line-height:20px;color:#ffffff;text-decoration:none;border-radius:8px;">Schedule a live demo</a>
    </td>
  </tr>
</table>`
}

export type RenderInput = {
  subject: string
  /** Already sanitised. */
  bodyHtml: string
  layout: MailLayout
  signature: MailSignature | null
  demoButton: boolean
  /** Bulk mail only: adds the opt-out line to the footer and the text part. */
  unsubscribeUrl?: string | null
}

/**
 * Plain mail keeps the opt-out as a personal postscript: Gmail files a
 * newsletter-style footer under Promotions, a sentence from the sender it does not.
 */
const PLAIN_OPT_OUT = 'P.S. If this is not relevant for your school, just reply “no” or'

function unsubscribeHtml(url: string, layout: MailLayout): string {
  if (layout === 'PLAIN') {
    return `<p style="margin:24px 0 0;font-family:${FONT};font-size:14px;line-height:21px;color:#555555;">
${PLAIN_OPT_OUT} <a href="${esc(url)}" style="color:#555555;text-decoration:underline;">click here</a>, and I will not write again.
</p>`
  }
  return `<p style="margin:6px 0 0;font-family:${FONT};font-size:12px;line-height:18px;color:#7b8394;">
You are receiving this because your school's contact address is listed publicly. Not interested?
<a href="${esc(url)}" style="color:#7b8394;text-decoration:underline;">Unsubscribe</a> and we will not email you again.
</p>`
}

export function renderMail(input: RenderInput): { html: string; text: string } {
  const body = inlineMailStyles(input.bodyHtml, input.layout)
  const preheader = mailHtmlToText(input.bodyHtml)
    .replace(/^Dear [^\n]*\n+/i, '')
    .replace(/\s+/g, ' ')
    .slice(0, 140)

  const textParts = [mailHtmlToText(input.bodyHtml)]
  if (input.demoButton) textParts.push(`Schedule a live demo: ${DEMO_URL}`)
  if (input.signature) textParts.push(signatureText(input.signature))
  if (input.unsubscribeUrl) {
    textParts.push(
      input.layout === 'PLAIN'
        ? `${PLAIN_OPT_OUT} open ${input.unsubscribeUrl}, and I will not write again.`
        : `Not interested? Unsubscribe: ${input.unsubscribeUrl}`,
    )
  }
  const text = textParts.join('\n\n') + '\n'

  const html = input.layout === 'PLAIN' ? plainShell(input, body) : brandedShell(input, body, preheader)
  return { html, text }
}

function head(subject: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<title>${esc(subject)}</title>
<style>
  @media only screen and (max-width:620px) {
    .mcv-shell { width:100% !important; }
    .mcv-pad   { padding-left:22px !important; padding-right:22px !important; }
  }
</style>
</head>`
}

function preheaderHtml(preheader: string): string {
  return `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;opacity:0;color:transparent;height:0;width:0;">${esc(preheader)}</div>`
}

function brandedShell(input: RenderInput, body: string, preheader: string): string {
  return `${head(input.subject)}
<body style="margin:0;padding:0;background-color:#f4f5f8;">
  ${preheaderHtml(preheader)}
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f4f5f8;">
    <tr>
      <td align="center" style="padding:28px 12px;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="600" class="mcv-shell" style="width:600px;max-width:600px;border-collapse:collapse;">
          <tr>
            <td align="left" bgcolor="${NAVY}" style="background-color:${NAVY};padding:22px 36px;border-radius:12px 12px 0 0;">
              <img src="${LOGO_URL}" width="190" height="32" alt="MyCampusView"
                   style="display:block;border:0;outline:none;width:190px;height:32px;font-family:${FONT};font-size:21px;font-weight:800;color:#ffffff;">
            </td>
          </tr>
          <tr>
            <td bgcolor="#ffffff" class="mcv-pad" style="background-color:#ffffff;padding:32px 36px 8px;">
              ${body}
              ${input.demoButton ? demoButtonHtml() : ''}
            </td>
          </tr>
          ${
            input.signature
              ? `<tr>
            <td bgcolor="#ffffff" class="mcv-pad" style="background-color:#ffffff;padding:0 36px 32px;border-radius:0 0 12px 12px;">
              <div style="border-top:1px solid #eceef3;padding-top:22px;">
                ${signatureHtml(input.signature, 'BRANDED')}
              </div>
            </td>
          </tr>`
              : `<tr><td bgcolor="#ffffff" style="background-color:#ffffff;height:24px;border-radius:0 0 12px 12px;"></td></tr>`
          }
          <tr>
            <td align="center" style="padding:18px 36px 4px;font-family:${FONT};font-size:12px;line-height:19px;color:#7b8394;">
              <strong style="color:#4a5468;">MyCampusView</strong> &nbsp;·&nbsp; One platform for the whole school
              &nbsp;·&nbsp; <a href="${WEBSITE_URL}" style="color:#4a5468;text-decoration:none;">mycampusview.com</a>
              ${input.unsubscribeUrl ? unsubscribeHtml(input.unsubscribeUrl, 'BRANDED') : ''}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`
}

/** No hidden preheader: that is a newsletter device, and plain mail should read as one person writing. */
function plainShell(input: RenderInput, body: string): string {
  return `${head(input.subject)}
<body style="margin:0;padding:0;background-color:#ffffff;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
    <tr>
      <td align="left" style="padding:20px 16px;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="640" class="mcv-shell" style="width:640px;max-width:640px;">
          <tr>
            <td>
              ${body}
              ${input.demoButton ? demoButtonHtml() : ''}
              ${input.signature ? `<div style="margin-top:8px;">${signatureHtml(input.signature, 'PLAIN')}</div>` : ''}
              ${input.unsubscribeUrl ? unsubscribeHtml(input.unsubscribeUrl, 'PLAIN') : ''}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`
}

/* ---------------------------------------------------------- received mail */

export type InlineImage = { contentId: string; contentType: string; content: Buffer }

const REMOTE_IMAGE = /<img\b[^>]*\bsrc\s*=\s*["']?https?:|url\(\s*["']?https?:/i

/**
 * Received HTML is hostile by default. It is sanitised, shown only inside a
 * sandboxed iframe without scripts, and pinned by a CSP that refuses every
 * network fetch — remote images (tracking pixels) load only when the reader
 * asks for them. Inline `cid:` images are embedded as data URIs.
 */
export function prepareIncomingHtml(
  html: string,
  opts: { allowRemoteImages: boolean; inlineImages: InlineImage[] },
): { html: string; hasRemoteImages: boolean } {
  const inline = new Map(
    opts.inlineImages.map((i) => [i.contentId.toLowerCase(), `data:${i.contentType};base64,${i.content.toString('base64')}`]),
  )
  const clean = sanitizeHtml(html, {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      'img', 'style', 'font', 'center', 'span', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'col', 'colgroup',
      'u', 's', 'strike', 'sub', 'sup', 'small', 'big',
    ],
    // <style> is needed for real-world newsletters; it cannot execute inside a
    // script-less sandbox, and the CSP blocks any url() it references.
    allowVulnerableTags: true,
    nonTextTags: ['script', 'textarea', 'option', 'noscript', 'title', 'style'],
    allowedAttributes: {
      '*': ['style', 'class', 'align', 'valign', 'width', 'height', 'bgcolor', 'border', 'dir', 'color', 'face', 'size', 'lang'],
      a: ['href', 'name', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height'],
      table: ['cellpadding', 'cellspacing', 'role'],
      td: ['colspan', 'rowspan', 'nowrap'],
      th: ['colspan', 'rowspan', 'nowrap', 'scope'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['http', 'https', 'data', 'cid'] },
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attribs) => ({ tagName, attribs: { ...attribs, target: '_blank', rel: 'noopener noreferrer' } }),
      img: (tagName, attribs) => {
        const src = attribs.src ?? ''
        if (!src.toLowerCase().startsWith('cid:')) return { tagName, attribs }
        const data = inline.get(src.slice(4).replace(/^<|>$/g, '').toLowerCase())
        const next = { ...attribs }
        if (data) next.src = data
        else delete next.src
        return { tagName, attribs: next }
      },
    },
  })

  const hasRemoteImages = REMOTE_IMAGE.test(clean)
  const remote = opts.allowRemoteImages ? ' https: http:' : ''
  const csp = `default-src 'none'; style-src 'unsafe-inline'; img-src data:${remote}; font-src data:${remote}`
  const doc = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="referrer" content="no-referrer"><base target="_blank"><style>html,body{margin:0}body{padding:20px;font-family:${FONT};font-size:14px;line-height:1.55;color:#1f2937;background:#ffffff;overflow-wrap:anywhere}img{max-width:100%;height:auto}pre{white-space:pre-wrap}blockquote{margin:0 0 0 6px;padding-left:12px;border-left:3px solid #e5e7eb;color:#4b5563}a{color:#1d4ed8}</style></head><body>${clean}</body></html>`
  return { html: doc, hasRemoteImages }
}
