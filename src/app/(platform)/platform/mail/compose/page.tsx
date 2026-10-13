import { PageHeader } from '@/components/page-header'
import { Notice } from '@/components/ui/states'
import { canManageMailboxes, composeOptions } from '@/server/modules/platform/mail/service'
import { matchCrmSenders, readMessage, type InboxMessage, type MailAddress } from '@/server/modules/platform/mail/inbox'
import { MAIL_LAYOUTS, type MailLayout } from '@/lib/platform-mail'
import { MailTabs, requireMailContext } from '../tabs'
import { ComposeForm, type ComposeInitial, type ComposeTemplate } from './compose-form'

export const metadata = { title: 'Compose · Mail' }

function escapeText(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** CRM templates are plain text; carry their paragraphs into the editor. */
function textToHtml(text: string) {
  return text
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeText(block.trim()).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

function prefixed(prefix: string, subject: string) {
  const clean = subject === '(no subject)' ? '' : subject
  return new RegExp(`^${prefix}\\s`, 'i').test(clean) ? clean : `${prefix} ${clean}`.trim()
}

function who(a: MailAddress | null) {
  if (!a) return 'Unknown sender'
  return a.name ? `${escapeText(a.name)} &lt;${escapeText(a.address)}&gt;` : escapeText(a.address)
}

/**
 * The original travels as plain paragraphs: the editor and the send path only
 * keep simple structure, and a quoted newsletter would not survive anyway.
 * Placeholder braces are broken so quoted text never blocks sending.
 */
function quoteOriginal(m: InboxMessage, forward: boolean) {
  const when = m.date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })
  const body = textToHtml(m.text.trim().slice(0, 20_000) || '(no text)').replace(/\{\{/g, '{ {')
  if (forward) {
    const lines = [
      '---------- Forwarded message ----------',
      `From: ${who(m.from)}`,
      `Date: ${escapeText(when)}`,
      `Subject: ${escapeText(m.subject)}`,
      `To: ${m.to.map(who).join(', ')}`,
      ...(m.cc.length ? [`Cc: ${m.cc.map(who).join(', ')}`] : []),
    ]
    return `<p>${lines.join('<br>')}</p>${body}`
  }
  return `<p>On ${escapeText(when)}, ${who(m.from)} wrote:</p><blockquote>${body}</blockquote>`
}

export default async function ComposePage({
  searchParams,
}: {
  searchParams: Promise<{
    school?: string
    contact?: string
    template?: string
    draft?: string
    to?: string
    mode?: string
    box?: string
    folder?: string
    uid?: string
  }>
}) {
  const ctx = await requireMailContext()
  const sp = await searchParams
  const options = await composeOptions(ctx)
  let originError: string | null = null

  const crmTemplates: ComposeTemplate[] = ctx.user.permissions.has('platform.crm')
    ? (
        await ctx.db.crmTemplate.findMany({
          where: { isActive: true, channel: 'EMAIL' },
          orderBy: [{ category: 'asc' }, { name: 'asc' }],
        })
      ).map((t) => ({
        key: `crm:${t.id}`,
        name: t.name,
        group: `Growth CRM · ${t.category}`,
        subject: t.subject ?? '',
        bodyHtml: textToHtml(t.body),
        demoButton: false,
      }))
    : []

  let initial: ComposeInitial = {
    schoolId: options.schools.some((s) => s.id === sp.school) ? sp.school : undefined,
    contactId: sp.contact,
    to: sp.to,
    templateKey: sp.template,
  }

  if (initial.schoolId && !initial.to) {
    const school = options.schools.find((s) => s.id === initial.schoolId)!
    const contact = school.contacts.find((c) => c.id === sp.contact) ?? school.contacts.find((c) => c.email)
    initial = { ...initial, contactId: contact?.id, to: contact?.email || school.email || undefined }
  }

  if (sp.draft) {
    const draft = await ctx.db.platformEmail.findUnique({
      where: { id: sp.draft },
      include: { attachments: { select: { documentId: true } } },
    })
    if (draft) {
      const liveDocs = new Set(options.documents.map((d) => d.id))
      initial = {
        mailboxId: draft.mailboxId ?? undefined,
        schoolId: draft.crmSchoolId ?? undefined,
        to: draft.to.join(', '),
        cc: draft.cc.join(', '),
        bcc: draft.bcc.join(', '),
        subject: draft.subject,
        bodyHtml: draft.bodyHtml,
        layout: (MAIL_LAYOUTS as readonly string[]).includes(draft.layout) ? (draft.layout as MailLayout) : 'BRANDED',
        demoButton: draft.html.includes('Schedule a live demo'),
        documentIds: draft.attachments.map((a) => a.documentId).filter((id): id is string => !!id && liveDocs.has(id)),
      }
    }
  }

  const mode = sp.mode === 'reply' || sp.mode === 'all' || sp.mode === 'forward' ? sp.mode : null
  const uid = Number(sp.uid)
  if (mode && sp.box && Number.isInteger(uid) && uid > 0) {
    try {
      const original = await readMessage(ctx, sp.box, sp.folder || 'INBOX', uid, { markSeen: false })
      const own = new Set(options.mailboxes.map((m) => m.fromEmail.toLowerCase()))
      const sender = original.replyTo[0] ?? original.from
      const quoted = quoteOriginal(original, mode === 'forward')
      const subject = mode === 'forward' ? prefixed('Fwd:', original.subject) : prefixed('Re:', original.subject)
      let to = ''
      let cc = ''
      if (mode !== 'forward') {
        const replyTo = sender && !own.has(sender.address) ? [sender.address] : original.to.map((a) => a.address).filter((a) => !own.has(a))
        to = replyTo.join(', ')
        if (mode === 'all') {
          const rest = [...original.to, ...original.cc]
            .map((a) => a.address)
            .filter((a) => !own.has(a) && !replyTo.includes(a))
          cc = [...new Set(rest)].join(', ')
        }
      }
      const matches = await matchCrmSenders(ctx, [sender?.address ?? ''])
      const match = sender ? matches.get(sender.address) : undefined
      initial = {
        mailboxId: sp.box,
        schoolId: mode !== 'forward' && match && options.schools.some((s) => s.id === match.schoolId) ? match.schoolId : undefined,
        to,
        cc,
        subject,
        bodyHtml: `<p><br></p>${quoted}`,
        layout: 'PLAIN',
        demoButton: false,
        inReplyTo: mode !== 'forward' ? (original.messageId ?? undefined) : undefined,
        references:
          mode !== 'forward' && original.messageId
            ? [...original.references, original.messageId].slice(-20).join(' ')
            : undefined,
        origin: { mailboxId: sp.box, folder: sp.folder || 'INBOX', uid },
        forwardAttachments:
          mode === 'forward' ? original.attachments.map((a) => ({ index: a.index, filename: a.filename, size: a.size })) : [],
        replyLabel:
          mode === 'forward'
            ? `Forwarding “${original.subject}”`
            : `Replying to ${original.from?.name || original.from?.address || 'the sender'}`,
      }
    } catch (e) {
      originError = e instanceof Error ? e.message : 'The original message could not be opened.'
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={mode === 'forward' ? 'Forward' : mode ? 'Reply' : 'Compose'}
        description="Sent from your own mailbox, with a copy saved to its Sent folder."
        breadcrumbs={[{ label: 'Mail', href: '/platform/mail/inbox' }, { label: mode === 'forward' ? 'Forward' : mode ? 'Reply' : 'Compose' }]}
      />
      <MailTabs current="compose" showSettings={canManageMailboxes(ctx)} />
      {originError ? (
        <Notice tone="warning" title="The original message could not be loaded">
          {originError} You can still write a new email below.
        </Notice>
      ) : null}
      <ComposeForm
        mailboxes={options.mailboxes}
        schools={options.schools}
        documents={options.documents}
        crmTemplates={crmTemplates}
        initial={initial}
      />
    </div>
  )
}
