/**
 * Platform mail — shared by the console UI and the server.
 *
 * The MyCampusView team sends proposals and correspondence from its own
 * mailbox (Hostinger by default). Nothing here touches credentials.
 */

export const HOSTINGER_PRESET = {
  smtpHost: 'smtp.hostinger.com',
  smtpPort: 465,
  smtpSecure: true,
  imapHost: 'imap.hostinger.com',
  imapPort: 993,
} as const

export const MAIL_LAYOUTS = ['BRANDED', 'PLAIN'] as const
export type MailLayout = (typeof MAIL_LAYOUTS)[number]

export const MAIL_LAYOUT_LABELS: Record<MailLayout, string> = {
  BRANDED: 'Branded — MyCampusView header and footer',
  PLAIN: 'Plain — reads like a personal email',
}

export const MAX_RECIPIENTS = 50
/** Hostinger accepts larger messages, but many school inboxes cap at ~25 MB. */
export const MAX_ATTACHMENT_TOTAL_MB = 15

export const DEMO_URL = 'https://www.mycampusview.com/book-demo'
export const WEBSITE_URL = 'https://www.mycampusview.com'

export type MailTemplateVars = {
  contactName: string
  schoolName: string
  senderName: string
  senderTitle: string
}

export const MAIL_TEMPLATE_VAR_HINT =
  '{{contactName}}, {{schoolName}}, {{senderName}} and {{senderTitle}} are filled in automatically. Your signature is added below the message.'

export type MailTemplate = {
  key: string
  name: string
  subject: string
  bodyHtml: string
  demoButton: boolean
}

const MODULE_POINTS = `<ul>
<li><strong>Fees &amp; accounts</strong> — live dues, receipts, reminders, online payment and Tally export, with no registers to reconcile.</li>
<li><strong>Attendance &amp; academics</strong> — registers on the phone with instant parent alerts, timetable, marks and report cards.</li>
<li><strong>Parents &amp; communication</strong> — a parent app for attendance, homework, results and fees, plus WhatsApp notifications.</li>
<li><strong>Operations</strong> — admissions, transport tracking, library, store, gate passes and CCTV live view.</li>
</ul>`

export const BROCHURE_URL = 'https://app.mycampusview.com/downloads/MyCampusView-Brochure.pdf'

export const MAIL_TEMPLATES: MailTemplate[] = [
  {
    key: 'hook-pizza',
    name: 'Brochure hook: “track their pizza” (Primary inbox)',
    subject: 'Parents track their pizza live. What about {{schoolName}}?',
    demoButton: false,
    bodyHtml: `<p>Dear {{contactName}},</p>
<p>Parents today can see exactly where their dinner is, minute by minute. Yet most still find out at 4 PM that their child was absent, or that fees were due from a slip in the school bag.</p>
<p>I am {{senderName}} from MyCampusView. We put attendance alerts, fee payments, homework and report cards on every parent's phone, in {{schoolName}}'s own name and logo, and send the principal a one-message WhatsApp summary of the school every evening.</p>
<p>I have put the whole idea on four short pages, including a before-and-after of a normal school day: <a href="${BROCHURE_URL}">MyCampusView brochure (PDF)</a>.</p>
<p>Would a 15-minute demo, set up with your own classes and fee structure, be useful this week or next? A one-word reply ("DEMO") is enough.</p>`,
  },
  {
    key: 'hook-switch',
    name: 'Brochure hook: “60-second ERP test” (schools with an ERP)',
    subject: 'A 60-second test for {{schoolName}}’s current ERP',
    demoButton: false,
    bodyHtml: `<p>Dear {{contactName}},</p>
<p>If {{schoolName}} already uses an ERP, I am not writing to ask you to throw it out. Just to ask three quick questions.</p>
<p>Does a parent get an alert within minutes when their child is marked absent? Can your accountant send fee entries to Tally without retyping them? Does the principal get a summary of the day on WhatsApp without asking anyone?</p>
<p>If the honest answer to any of these is "not really", that is the part MyCampusView fixes. Our team moves your students, fee plans and pending dues across for you, and your staff can be live in four to six weeks.</p>
<p>The full 10-question test is on page 3 of our brochure, and it takes a minute: <a href="${BROCHURE_URL}">MyCampusView brochure (PDF)</a>.</p>
<p>Would you be open to a 15-minute side-by-side with what you use today? Just reply "DEMO" and suggest a time.</p>`,
  },
  {
    key: 'personal-intro',
    name: 'Personal introduction (Primary inbox)',
    subject: 'Quick question for {{schoolName}}',
    demoButton: false,
    bodyHtml: `<p>Dear {{contactName}},</p>
<p>I am {{senderName}} from MyCampusView. We help schools manage fees, attendance, report cards and parent communication from one simple system, in the school's own name.</p>
<p>May I ask how {{schoolName}} handles fee collection and parent updates today? If it would help, I would be glad to show you a short 15-minute demo at a time that suits you.</p>
<p>Would that be of interest?</p>`,
  },
  {
    key: 'proposal',
    name: 'Proposal cover letter',
    subject: 'Proposal for {{schoolName}} — MyCampusView School ERP',
    demoButton: true,
    bodyHtml: `<p>Dear {{contactName}},</p>
<p>Thank you for the opportunity to share how MyCampusView can support your school. Please find attached our proposal for implementing <strong>MyCampusView School ERP</strong> at {{schoolName}}.</p>
<p>It explains how {{schoolName}} can run admissions, fees, attendance, academics, parent communication and daily operations on one platform — with your school's name and logo — and how our team will take you live in four to six weeks.</p>
${MODULE_POINTS}
<p>The best next step is a short live demonstration for your management and office team, set up with your own classes and fee structure. Please suggest a convenient day and time, or book a slot below.</p>`,
  },
  {
    key: 'introduction',
    name: 'Introduction and meeting request',
    subject: 'Introducing MyCampusView — one platform for {{schoolName}}',
    demoButton: true,
    bodyHtml: `<p>Dear {{contactName}},</p>
<p>I am {{senderName}}, {{senderTitle}} at MyCampusView. We help schools run fees, attendance, academics and parent communication on a single platform, branded with the school's own name and logo.</p>
${MODULE_POINTS}
<p>I would welcome twenty minutes with you to understand how {{schoolName}} works today and to show what this could look like for your team. Please let me know a time that suits you, or book a slot below.</p>`,
  },
  {
    key: 'follow-up',
    name: 'Proposal follow-up',
    subject: 'Following up — MyCampusView proposal for {{schoolName}}',
    demoButton: true,
    bodyHtml: `<p>Dear {{contactName}},</p>
<p>I hope you are well. I am following up on the proposal we shared for {{schoolName}}, and wanted to check whether you or your team had any questions.</p>
<p>If it would help, we can walk your office staff through fee collection, attendance and the parent app in a short live session, using your own classes and fee structure.</p>
<p>Please let me know a convenient time, and I will arrange everything at our end.</p>`,
  },
  {
    key: 'after-demo',
    name: 'Thank you after demo',
    subject: 'Thank you for your time — MyCampusView demo',
    demoButton: false,
    bodyHtml: `<p>Dear {{contactName}},</p>
<p>Thank you for taking the time to see MyCampusView today. It was a pleasure to understand how {{schoolName}} works and where we can make the day easier for your team.</p>
<p>As discussed, I have attached the relevant documents for your reference. The next steps on our side are:</p>
<ul>
<li>Share your class list and fee structure so we can set up your school.</li>
<li>Confirm the go-live date and the staff to be trained.</li>
<li>Agree the data migration from your current registers or software.</li>
</ul>
<p>Please feel free to reach out with any question in the meantime.</p>`,
  },
  {
    key: 'quotation',
    name: 'Quotation shared',
    subject: 'Quotation for {{schoolName}} — MyCampusView School ERP',
    demoButton: false,
    bodyHtml: `<p>Dear {{contactName}},</p>
<p>Further to our discussion, please find attached the quotation for implementing MyCampusView School ERP at {{schoolName}}.</p>
<p>The quotation covers the modules we agreed, onboarding and data migration, staff training and ongoing support. I would be glad to go through it with you or your management at a convenient time.</p>`,
  },
]

/** Fills the known variables; anything unknown is left for the sender to spot. */
export function fillMailTemplate(text: string, vars: Partial<MailTemplateVars>): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => {
    const value = vars[key as keyof MailTemplateVars]
    return value ? value : match
  })
}

export function unresolvedPlaceholders(text: string): string[] {
  return Array.from(new Set(Array.from(text.matchAll(/\{\{\s*(\w+)\s*\}\}/g), (m) => m[1]!)))
}

const EMAIL_RE = /^[^\s@<>(),;:"[\]]+@[^\s@<>(),;:"[\]]+\.[^\s@<>(),;:"[\]]{2,}$/

/** Splits "a@x.com, b@y.com; c@z.com" into addresses; returns the invalid ones too. */
export function parseAddressList(raw: string): { valid: string[]; invalid: string[] } {
  const parts = raw
    .split(/[,;\n]+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const angle = p.match(/<([^>]+)>/)
      return (angle ? angle[1]! : p).trim().toLowerCase()
    })
  const valid: string[] = []
  const invalid: string[] = []
  for (const p of parts) {
    if (EMAIL_RE.test(p)) {
      if (!valid.includes(p)) valid.push(p)
    } else {
      invalid.push(p)
    }
  }
  return { valid, invalid }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
