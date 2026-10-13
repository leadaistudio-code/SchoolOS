import { z } from 'zod'
import { HOSTINGER_PRESET, MAIL_LAYOUTS } from '@/lib/platform-mail'

/** HTML checkboxes post "on" or nothing; z.coerce.boolean() would read "false" as true. */
const checkbox = z.preprocess((v) => v === true || v === 'on' || v === 'true' || v === '1', z.boolean())

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null)

export const mailboxSchema = z.object({
  id: z.string().trim().optional().transform((v) => v || undefined),
  fromName: z.string().trim().min(1, 'Enter the sender name').max(120),
  fromEmail: z.string().trim().toLowerCase().email('Enter a valid email address'),
  replyTo: z
    .union([z.string().trim().toLowerCase().email('Enter a valid reply-to address'), z.literal('')])
    .optional()
    .transform((v) => v || null),
  username: z.string().trim().max(200).optional().transform((v) => v || undefined),
  password: z.string().max(400).optional().transform((v) => v || undefined),
  smtpHost: z.string().trim().min(1, 'Enter the SMTP server').max(200).default(HOSTINGER_PRESET.smtpHost),
  smtpPort: z.coerce.number().int().min(1).max(65535).default(HOSTINGER_PRESET.smtpPort),
  smtpSecure: checkbox,
  sendVia: z.enum(['SMTP', 'RESEND']).default('SMTP'),
  resendKey: z
    .string()
    .trim()
    .max(400)
    .optional()
    .transform((v) => v || undefined)
    .refine((v) => !v || v.startsWith('re_'), 'A Resend API key starts with “re_”'),
  imapEnabled: checkbox,
  imapHost: z.string().trim().max(200).default(HOSTINGER_PRESET.imapHost),
  imapPort: z.coerce.number().int().min(1).max(65535).default(HOSTINGER_PRESET.imapPort),
  signatureName: optionalText(120),
  signatureTitle: optionalText(120),
  signaturePhone: optionalText(40),
  signatureWebsite: optionalText(200),
  isDefault: checkbox,
})

export type MailboxInput = z.infer<typeof mailboxSchema>

export const composeSchema = z.object({
  mailboxId: z.string().trim().min(1, 'Choose the mailbox to send from'),
  to: z.string().max(5000).default(''),
  cc: z.string().max(5000).default(''),
  bcc: z.string().max(5000).default(''),
  subject: z.string().trim().min(1, 'Enter a subject').max(200),
  bodyHtml: z.string().max(200_000),
  layout: z.enum(MAIL_LAYOUTS).default('BRANDED'),
  demoButton: checkbox,
  includeSignature: checkbox,
  crmSchoolId: z.string().trim().optional().transform((v) => v || null),
  documentIds: z.array(z.string().trim().min(1)).max(10).default([]),
  /** Set when replying: threads the answer under the original in every mail client. */
  inReplyTo: z.string().trim().max(1000).optional().transform((v) => v || null),
  references: z.string().trim().max(8000).optional().transform((v) => v || null),
  /** The received message being replied to or forwarded, as mailboxId, folder and UID. */
  origin: z
    .object({ mailboxId: z.string().min(1), folder: z.string().min(1).max(500), uid: z.coerce.number().int().positive() })
    .nullable()
    .default(null),
  /** Attachments of the original message to forward, by index. */
  forwardParts: z.array(z.coerce.number().int().min(0).max(200)).max(20).default([]),
})

export type ComposeInput = z.infer<typeof composeSchema>
