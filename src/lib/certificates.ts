import sanitizeHtml from 'sanitize-html'
import { z } from 'zod'

export const CERTIFICATE_TEMPLATE_KEYS = [
  'BONAFIDE',
  'TRANSFER',
  'CHARACTER',
  'ACHIEVEMENT',
  'CUSTOM',
] as const

const CERTIFICATE_HTML_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ['p', 'br', 'strong', 'em', 'u', 'ol', 'ul', 'li', 'span', 'div', 'h1', 'h2', 'h3', 'h4'],
  allowedAttributes: {
    span: ['class'],
    div: ['class'],
    p: ['class'],
    h1: ['class'],
    h2: ['class'],
    h3: ['class'],
    h4: ['class'],
  },
  allowedSchemes: [],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
}

/** Strip scripts, event handlers, and unsafe markup from certificate templates. */
export function sanitizeCertificateHtml(html: string): string {
  return sanitizeHtml(html, CERTIFICATE_HTML_OPTIONS).trim()
}

export const certificateTemplateSchema = z.object({
  key: z.enum(CERTIFICATE_TEMPLATE_KEYS),
  name: z.string().trim().min(2).max(80),
  bodyHtml: z
    .string()
    .trim()
    .min(20)
    .max(20000)
    .transform((value) => sanitizeCertificateHtml(value))
    .refine((value) => value.length >= 20, 'Certificate body is too short after cleaning unsafe HTML'),
  isActive: z.coerce.boolean().default(true),
})

export const certificateIssueSchema = z.object({
  templateId: z.string().min(1),
  studentId: z.string().min(1),
  purpose: z.string().trim().max(300).optional(),
})

const VARIABLE_PATTERN = /\{\{\s*([a-z_]+)\s*\}\}/gi

export type CertificateVariables = Record<string, string>

/** Escape text that will be interpolated into certificate HTML. */
export function escapeCertificateText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Replace {{variable}} placeholders in template HTML.
 * Template markup is sanitised; substituted values are always HTML-escaped.
 */
export function renderCertificateBody(bodyHtml: string, variables: CertificateVariables): string {
  const safeTemplate = sanitizeCertificateHtml(bodyHtml)
  return safeTemplate.replace(VARIABLE_PATTERN, (_, key: string) => {
    const raw = variables[key.toLowerCase()] ?? ''
    return escapeCertificateText(raw)
  })
}

export const DEFAULT_CERTIFICATE_TEMPLATES: Array<{
  key: (typeof CERTIFICATE_TEMPLATE_KEYS)[number]
  name: string
  bodyHtml: string
  isActive: boolean
}> = [
  {
    key: 'BONAFIDE',
    name: 'Bonafide certificate',
    isActive: true,
    bodyHtml: `<p>This is to certify that <strong>{{student_name}}</strong>, bearing admission number <strong>{{admission_no}}</strong>, is a bonafide student of <strong>{{class}}</strong> at {{school_name}} for the academic session {{session}}.</p>
<p>This certificate is issued upon request for {{purpose}}.</p>
<p>Date: {{date}}</p>`,
  },
  {
    key: 'TRANSFER',
    name: 'Transfer certificate',
    isActive: true,
    bodyHtml: `<p>This is to certify that <strong>{{student_name}}</strong> (Admission no. {{admission_no}}), a student of class <strong>{{class}}</strong>, has applied for a Transfer Certificate from {{school_name}}.</p>
<p>Date: {{date}}</p>`,
  },
  {
    key: 'CHARACTER',
    name: 'Character certificate',
    isActive: true,
    bodyHtml: `<p>This is to certify that <strong>{{student_name}}</strong> of class <strong>{{class}}</strong> has been a student of {{school_name}} and has conducted themselves well during their tenure.</p>
<p>Date: {{date}}</p>`,
  },
]
