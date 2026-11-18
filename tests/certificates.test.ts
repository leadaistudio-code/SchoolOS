import { describe, expect, it } from 'vitest'
import {
  renderCertificateBody,
  sanitizeCertificateHtml,
  escapeCertificateText,
  certificateTemplateSchema,
  certificateIssueSchema,
} from '../src/lib/certificates'

describe('certificate templates', () => {
  it('replaces variable placeholders in body HTML', () => {
    const html = '<p>{{student_name}} · {{class}} · {{school_name}}</p>'
    const rendered = renderCertificateBody(html, {
      student_name: 'Asha Kumar',
      class: 'Class 5 A',
      school_name: 'Little Pathshala',
    })
    expect(rendered).toContain('Asha Kumar')
    expect(rendered).toContain('Class 5 A')
    expect(rendered).not.toContain('{{student_name}}')
  })

  it('leaves unknown placeholders empty', () => {
    expect(renderCertificateBody('<p>{{missing}}</p>', {})).toBe('<p></p>')
  })

  it('HTML-escapes substituted variables', () => {
    const rendered = renderCertificateBody('<p>{{student_name}}</p>', {
      student_name: '<img src=x onerror=alert(1)>',
    })
    expect(rendered).toBe('<p>&lt;img src=x onerror=alert(1)&gt;</p>')
    expect(rendered).not.toContain('<img')
  })

  it('strips script tags from template HTML', () => {
    const cleaned = sanitizeCertificateHtml('<p>Safe</p><script>alert(1)</script><p onclick="x">More</p>')
    expect(cleaned).toContain('Safe')
    expect(cleaned).toContain('More')
    expect(cleaned).not.toContain('script')
    expect(cleaned).not.toContain('onclick')
  })

  it('sanitises templates on schema parse', () => {
    const parsed = certificateTemplateSchema.parse({
      key: 'BONAFIDE',
      name: 'Bonafide',
      bodyHtml: '<p>Certifies {{student_name}}</p><script>evil()</script>',
      isActive: true,
    })
    expect(parsed.bodyHtml).toContain('Certifies {{student_name}}')
    expect(parsed.bodyHtml).not.toContain('script')
  })

  it('escapes text for HTML context', () => {
    expect(escapeCertificateText(`A&B <C> "D" 'E'`)).toBe('A&amp;B &lt;C&gt; &quot;D&quot; &#39;E&#39;')
  })

  it('validates template input', () => {
    expect(
      certificateTemplateSchema.parse({
        key: 'BONAFIDE',
        name: 'Bonafide',
        bodyHtml: '<p>Certifies {{student_name}}</p>',
        isActive: true,
      }).name,
    ).toBe('Bonafide')
  })

  it('requires template and student to issue', () => {
    expect(() => certificateIssueSchema.parse({ templateId: '', studentId: 's1' })).toThrow()
    expect(
      certificateIssueSchema.parse({ templateId: 't1', studentId: 's1', purpose: 'visa' }).purpose,
    ).toBe('visa')
  })
})
