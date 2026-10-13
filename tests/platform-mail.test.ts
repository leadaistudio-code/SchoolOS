import { beforeEach, describe, expect, it, vi } from 'vitest'

const imap = vi.hoisted(() => ({
  boxes: [] as { path: string; specialUse?: string }[],
  appended: [] as { folder: string; raw: string; flags: string[] }[],
  connectError: null as Error | null,
}))
const smtp = vi.hoisted(() => ({ sent: [] as Record<string, unknown>[], verifyError: null as Error | null }))

vi.mock('imapflow', () => ({
  ImapFlow: class {
    async connect() {
      if (imap.connectError) throw imap.connectError
    }
    async list() {
      return imap.boxes
    }
    async append(folder: string, raw: Buffer, flags: string[]) {
      imap.appended.push({ folder, raw: raw.toString('utf8'), flags })
      return { destination: folder }
    }
    async logout() {}
  },
}))

vi.mock('nodemailer', () => ({
  default: {
    createTransport: () => ({
      async verify() {
        if (smtp.verifyError) throw smtp.verifyError
        return true
      },
      async sendMail(mail: Record<string, unknown>) {
        smtp.sent.push(mail)
        return { messageId: mail.messageId }
      },
    }),
  },
}))

import { encryptSecret } from '../src/server/crypto'
import {
  fillMailTemplate,
  MAIL_TEMPLATES,
  parseAddressList,
  unresolvedPlaceholders,
} from '../src/lib/platform-mail'
import { inlineMailStyles, mailHtmlToText, renderMail, sanitizeMailBody } from '../src/server/modules/platform/mail/render'
import {
  deliverMail,
  describeMailError,
  saveToSentFolder,
  sendOverSmtp,
  verifyMailbox,
  type MailboxConnection,
} from '../src/server/modules/platform/mail/transport'
import { isPlatformOnly } from '../src/server/db/tenant-models'

describe('mail body sanitising', () => {
  it('drops scripts, event handlers, styles and dangerous links', () => {
    const dirty =
      '<p onclick="steal()" style="color:red">Hi<script>alert(1)</script></p>' +
      '<a href="javascript:alert(1)">bad</a><a href="https://ok.example">good</a>' +
      '<img src=x onerror=alert(1)><iframe src="https://evil"></iframe>'
    const clean = sanitizeMailBody(dirty)
    expect(clean).not.toMatch(/script|onclick|onerror|style=|javascript:|<img|<iframe/i)
    expect(clean).toContain('<p>Hi</p>')
    expect(clean).toContain('<a href="https://ok.example">good</a>')
    expect(clean).toContain('bad')
  })

  it('normalises editor markup into the allowed tags', () => {
    expect(sanitizeMailBody('<div><b>Bold</b> <i>it</i></div>')).toBe('<p><strong>Bold</strong> <em>it</em></p>')
    expect(sanitizeMailBody('<h1>Title</h1>')).toBe('<h2>Title</h2>')
  })

  it('keeps mailto and tel links', () => {
    const clean = sanitizeMailBody('<a href="mailto:a@b.com">mail</a> <a href="tel:+911234">call</a>')
    expect(clean).toContain('href="mailto:a@b.com"')
    expect(clean).toContain('href="tel:+911234"')
  })
})

describe('mail rendering', () => {
  it('inlines a style on every block element', () => {
    const html = inlineMailStyles('<p>One</p><ul><li>Two</li></ul><a href="https://x.y">x</a>', 'BRANDED')
    expect(html).toMatch(/<p style="[^"]+">One<\/p>/)
    expect(html).toMatch(/<li style="[^"]+">Two<\/li>/)
    expect(html).toMatch(/<a href="https:\/\/x.y" style="[^"]+">/)
  })

  it('produces a readable plain-text alternative', () => {
    const text = mailHtmlToText(
      '<p>Dear Sir &amp; Madam,</p><ul><li>Fees</li><li>Attendance</li></ul><p>See <a href="https://www.mycampusview.com">our site</a>.</p>',
    )
    expect(text).toBe('Dear Sir & Madam,\n\n• Fees\n• Attendance\n\nSee our site (https://www.mycampusview.com).')
  })

  it('builds the branded email with logo, signature and demo button', () => {
    const { html, text } = renderMail({
      subject: 'Proposal for Cosmos',
      bodyHtml: '<p>Dear Sir / Madam,</p><p>Please find attached our proposal.</p>',
      layout: 'BRANDED',
      signature: {
        name: 'Manmohan Singh',
        title: 'Growth Manager',
        phone: '+91 98765 43210',
        email: 'contact@mycampusview.com',
        website: 'www.mycampusview.com',
      },
      demoButton: true,
    })
    expect(html).toContain('mycampusview-lockup.png')
    expect(html).toContain('Manmohan Singh')
    expect(html).toContain('href="tel:+919876543210"')
    expect(html).toContain('href="https://www.mycampusview.com"')
    expect(html).toContain('Schedule a live demo')
    expect(html).toContain('<title>Proposal for Cosmos</title>')
    expect(text).toContain('Warm regards,\nManmohan Singh\nGrowth Manager')
    expect(text).toContain('Schedule a live demo: https://www.mycampusview.com/book-demo')
  })

  it('escapes signature fields', () => {
    const { html } = renderMail({
      subject: 'x',
      bodyHtml: '<p>x</p>',
      layout: 'PLAIN',
      signature: { name: '<b>evil</b>', title: null, phone: null, email: 'a@b.com', website: null },
      demoButton: false,
    })
    expect(html).toContain('&lt;b&gt;evil&lt;/b&gt;')
    expect(html).not.toContain('mycampusview-lockup.png')
  })
})

describe('addresses and templates', () => {
  it('parses mixed separators, display names and duplicates', () => {
    const { valid, invalid } = parseAddressList('A <Principal@School.in>, office@school.in; principal@school.in\nnot-an-email')
    expect(valid).toEqual(['principal@school.in', 'office@school.in'])
    expect(invalid).toEqual(['not-an-email'])
  })

  it('fills known variables and reports the rest', () => {
    const filled = fillMailTemplate('Dear {{contactName}}, about {{schoolName}} and {{other}}', {
      contactName: 'Mrs Sharma',
      schoolName: 'Cosmos Public School',
    })
    expect(filled).toBe('Dear Mrs Sharma, about Cosmos Public School and {{other}}')
    expect(unresolvedPlaceholders(filled)).toEqual(['other'])
  })

  it('every built-in template survives sanitising unchanged in meaning', () => {
    for (const t of MAIL_TEMPLATES) {
      const clean = sanitizeMailBody(t.bodyHtml)
      expect(mailHtmlToText(clean).length).toBeGreaterThan(80)
      expect(unresolvedPlaceholders(clean).every((v) => ['contactName', 'schoolName', 'senderName', 'senderTitle'].includes(v))).toBe(true)
    }
  })
})

describe('mail transport', () => {
  const box = (): MailboxConnection => ({
    username: 'contact@mycampusview.com',
    passwordEncrypted: encryptSecret('mailbox-password'),
    smtpHost: 'smtp.hostinger.com',
    smtpPort: 465,
    smtpSecure: true,
    sendVia: 'SMTP',
    resendKeyEncrypted: null,
    fromEmail: 'contact@mycampusview.com',
    imapEnabled: true,
    imapHost: 'imap.hostinger.com',
    imapPort: 993,
    sentFolder: null,
  })
  const resendBox = (): MailboxConnection => ({ ...box(), sendVia: 'RESEND', resendKeyEncrypted: encryptSecret('re_test_key') })

  function mockFetch(responses: Record<string, { status?: number; body: unknown }>) {
    const calls: { url: string; init: RequestInit }[] = []
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      const hit = Object.entries(responses).find(([path]) => url.endsWith(path))
      const { status = 200, body } = hit?.[1] ?? { status: 404, body: { message: 'not found' } }
      return new Response(JSON.stringify(body), { status })
    })
    return calls
  }

  const mail = () => ({
    from: { name: 'MyCampusView', address: 'contact@mycampusview.com' },
    to: ['principal@school.in'],
    bcc: ['manager@mycampusview.com'],
    subject: 'Proposal',
    text: 'Hello',
    html: '<p>Hello</p>',
    attachments: [{ filename: 'Proposal.pdf', content: Buffer.from('%PDF-1.4 test'), contentType: 'application/pdf' }],
    messageId: '<abc.123@mycampusview.com>',
    date: new Date('2026-10-06T10:00:00Z'),
  })

  beforeEach(() => {
    imap.boxes = [{ path: 'INBOX' }, { path: 'INBOX.Sent' }, { path: 'INBOX.Drafts', specialUse: '\\Drafts' }]
    imap.appended = []
    imap.connectError = null
    smtp.sent = []
    smtp.verifyError = null
  })

  it('sends over SMTP with the caller-supplied Message-ID', async () => {
    const result = await sendOverSmtp(box(), mail())
    expect(result.messageId).toBe('<abc.123@mycampusview.com>')
    expect(smtp.sent).toHaveLength(1)
  })

  it('finds Hostinger’s INBOX.Sent and appends a seen copy that keeps Bcc and the attachment', async () => {
    const result = await saveToSentFolder(box(), mail())
    expect(result).toEqual({ ok: true, folder: 'INBOX.Sent' })
    expect(imap.appended).toHaveLength(1)
    const { raw, flags } = imap.appended[0]!
    expect(flags).toEqual(['\\Seen'])
    expect(raw).toMatch(/^Bcc: manager@mycampusview.com/m)
    expect(raw).toMatch(/^Message-ID: <abc.123@mycampusview.com>/im)
    expect(raw).toContain('filename=Proposal.pdf')
  })

  it('prefers the folder flagged \\Sent', async () => {
    imap.boxes = [{ path: 'INBOX.Sent' }, { path: 'Sent Items', specialUse: '\\Sent' }]
    expect(await saveToSentFolder(box(), mail())).toEqual({ ok: true, folder: 'Sent Items' })
  })

  it('reports a missing Sent folder instead of throwing', async () => {
    imap.boxes = [{ path: 'INBOX' }]
    const result = await saveToSentFolder(box(), mail())
    expect(result.ok).toBe(false)
  })

  it('verification names which half failed and never echoes the password', async () => {
    smtp.verifyError = Object.assign(new Error('Invalid login: 535 5.7.8 mailbox-password'), { code: 'EAUTH' })
    const result = await verifyMailbox(box())
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/^Sending \(SMTP\):/)
      expect(result.error).not.toContain('mailbox-password')
    }

    smtp.verifyError = null
    imap.connectError = Object.assign(new Error('Command failed'), { authenticationFailed: true })
    const imapResult = await verifyMailbox(box())
    expect(imapResult.ok).toBe(false)
    if (!imapResult.ok) expect(imapResult.error).toMatch(/^Saving to Sent \(IMAP\):.*rejected/)
  })

  it('verification returns the detected Sent folder', async () => {
    expect(await verifyMailbox(box())).toEqual({ ok: true, sentFolder: 'INBOX.Sent' })
  })

  it('maps common errors to plain English', () => {
    expect(describeMailError(Object.assign(new Error('x'), { code: 'ETIMEDOUT' }))).toMatch(/timed out/)
    expect(describeMailError(Object.assign(new Error('getaddrinfo ENOTFOUND smtp.bad'), { code: 'EDNS' }))).toMatch(/could not be found/)
    expect(describeMailError(Object.assign(new Error('x'), { code: 'EENVELOPE' }))).toMatch(/recipient/)
  })

  it('sends through Resend over HTTPS without touching SMTP', async () => {
    const calls = mockFetch({ '/emails': { body: { id: 'resend-id-1' } } })
    const result = await deliverMail(resendBox(), {
      ...mail(),
      replyTo: 'sales@mycampusview.com',
      inReplyTo: '<orig@school.in>',
      references: ['<a@x>', '<orig@school.in>'],
    })
    vi.unstubAllGlobals()

    expect(smtp.sent).toHaveLength(0)
    expect(result.messageId).toBe('<abc.123@mycampusview.com>')
    expect(calls).toHaveLength(1)
    const { url, init } = calls[0]!
    expect(url).toBe('https://api.resend.com/emails')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer re_test_key')
    const body = JSON.parse(String(init.body))
    expect(body.from).toBe('MyCampusView <contact@mycampusview.com>')
    expect(body.to).toEqual(['principal@school.in'])
    expect(body.bcc).toEqual(['manager@mycampusview.com'])
    expect(body.reply_to).toEqual(['sales@mycampusview.com'])
    expect(body.headers).toEqual({ 'In-Reply-To': '<orig@school.in>', References: '<a@x> <orig@school.in>' })
    expect(body.attachments).toEqual([
      { filename: 'Proposal.pdf', content: Buffer.from('%PDF-1.4 test').toString('base64'), content_type: 'application/pdf' },
    ])
  })

  it('uses SMTP when the mailbox is set to SMTP', async () => {
    await deliverMail(box(), mail())
    expect(smtp.sent).toHaveLength(1)
  })

  it('Resend verification explains an unverified domain and a bad key', async () => {
    mockFetch({ '/domains': { body: { data: [{ name: 'mycampusview.com', status: 'pending' }] } } })
    let result = await verifyMailbox(resendBox())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/^Sending \(Resend\): mycampusview.com .*not verified.*pending/)

    mockFetch({ '/domains': { status: 401, body: { name: 'validation_error', message: 'API key is invalid' } } })
    result = await verifyMailbox(resendBox())
    if (!result.ok) {
      expect(result.error).toMatch(/rejected the API key/)
      expect(result.error).not.toContain('re_test_key')
    }

    mockFetch({ '/domains': { body: { data: [{ name: 'mycampusview.com', status: 'verified' }] } } })
    expect(await verifyMailbox(resendBox())).toEqual({ ok: true, sentFolder: 'INBOX.Sent' })

    mockFetch({ '/domains': { status: 401, body: { name: 'restricted_api_key', message: 'This API key is restricted to only send emails' } } })
    expect((await verifyMailbox(resendBox())).ok).toBe(true)
    vi.unstubAllGlobals()
  })

  it('points SMTP timeouts at the Resend option', () => {
    expect(describeMailError(Object.assign(new Error('x'), { code: 'ETIMEDOUT' }))).toMatch(/Resend/)
  })
})

describe('platform mail isolation', () => {
  it('marks every mail model platform-only so tenant code cannot reach it', () => {
    for (const model of ['PlatformMailbox', 'PlatformEmail', 'PlatformEmailAttachment', 'PlatformDocument']) {
      expect(isPlatformOnly(model)).toBe(true)
    }
  })
})
