import { z } from 'zod'

export const CERTIFICATE_TEMPLATE_KEYS = [
  'BONAFIDE',
  'TRANSFER',
  'CHARACTER',
  'ACHIEVEMENT',
  'CUSTOM',
] as const

export const certificateTemplateSchema = z.object({
  key: z.enum(CERTIFICATE_TEMPLATE_KEYS),
  name: z.string().trim().min(2).max(80),
  bodyHtml: z.string().trim().min(20).max(20000),
  isActive: z.coerce.boolean().default(true),
})

export const certificateIssueSchema = z.object({
  templateId: z.string().min(1),
  studentId: z.string().min(1),
  purpose: z.string().trim().max(300).optional(),
})

const VARIABLE_PATTERN = /\{\{\s*([a-z_]+)\s*\}\}/gi

export type CertificateVariables = Record<string, string>

/** Replace {{variable}} placeholders in template HTML. */
export function renderCertificateBody(bodyHtml: string, variables: CertificateVariables): string {
  return bodyHtml.replace(VARIABLE_PATTERN, (_, key: string) => variables[key.toLowerCase()] ?? '')
}

export const DEFAULT_CERTIFICATE_TEMPLATES: Array<z.infer<typeof certificateTemplateSchema>> = [
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
