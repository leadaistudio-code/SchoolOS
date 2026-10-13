import { describe, expect, it } from 'vitest'
import { prepareIncomingHtml } from '../src/server/modules/platform/mail/render'

const none = { allowRemoteImages: false, inlineImages: [] }

describe('received mail rendering', () => {
  it('strips scripts, handlers, frames, forms and javascript links', () => {
    const { html } = prepareIncomingHtml(
      '<p onclick="steal()">Hi<script>alert(1)</script></p><a href="javascript:alert(1)">x</a>' +
        '<iframe src="https://evil"></iframe><form action="https://evil"><input name="pw"></form>' +
        '<img src="x" onerror="alert(1)"><svg onload="alert(1)"></svg><object data="x"></object>',
      none,
    )
    const body = html.slice(html.indexOf('<body>'))
    expect(body).not.toMatch(/<script|onclick|onerror|onload|javascript:|<iframe|<form|<input|<svg|<object/i)
    expect(body).toContain('Hi')
  })

  it('keeps layout markup and inline styles real emails depend on', () => {
    const { html } = prepareIncomingHtml(
      '<table width="600" cellpadding="0"><tr><td style="color:#333" bgcolor="#fff" colspan="2">Cell</td></tr></table>',
      none,
    )
    expect(html).toContain('<table width="600" cellpadding="0">')
    expect(html).toContain('style="color:#333"')
    expect(html).toContain('colspan="2"')
  })

  it('blocks remote images behind a CSP until the reader allows them', () => {
    const src = '<p>Hello</p><img src="https://tracker.example/pixel.gif">'
    const blocked = prepareIncomingHtml(src, none)
    expect(blocked.hasRemoteImages).toBe(true)
    expect(blocked.html).toMatch(/img-src data:;/)
    expect(blocked.html).toContain("default-src 'none'")

    const allowed = prepareIncomingHtml(src, { ...none, allowRemoteImages: true })
    expect(allowed.html).toMatch(/img-src data: https: http:/)
  })

  it('reports no remote images for plain messages', () => {
    expect(prepareIncomingHtml('<p>Just text</p>', none).hasRemoteImages).toBe(false)
  })

  it('embeds cid: inline images and drops unknown ones', () => {
    const { html } = prepareIncomingHtml('<img src="cid:logo@x"><img src="cid:missing@x">', {
      allowRemoteImages: false,
      inlineImages: [{ contentId: 'logo@x', contentType: 'image/png', content: Buffer.from('png') }],
    })
    expect(html).toContain(`src="data:image/png;base64,${Buffer.from('png').toString('base64')}"`)
    expect(html).not.toContain('cid:missing')
  })

  it('opens links in a new tab without a referrer', () => {
    const { html } = prepareIncomingHtml('<a href="https://www.mycampusview.com">site</a>', none)
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('<meta name="referrer" content="no-referrer">')
  })

  it('does not leak <title> text into the body', () => {
    const { html } = prepareIncomingHtml('<html><head><title>Secret title</title></head><body><p>Body</p></body></html>', none)
    expect(html.slice(html.indexOf('<body>'))).not.toContain('Secret title')
  })
})
