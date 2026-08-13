import { describe, expect, it } from 'vitest'
import {
  renderCertificateBody,
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
