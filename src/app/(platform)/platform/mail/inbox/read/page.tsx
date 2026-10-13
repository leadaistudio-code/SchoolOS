import Link from 'next/link'
import { ArrowLeft, Download, FileText, Forward, ImageOff, Reply, ReplyAll } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Notice } from '@/components/ui/states'
import { buttonVariants } from '@/components/ui/button-variants'
import { formatBytes } from '@/lib/platform-mail'
import { canManageMailboxes } from '@/server/modules/platform/mail/service'
import { listFolders, matchCrmSenders, readMessage, type MailAddress } from '@/server/modules/platform/mail/inbox'
import { MailTabs, requireMailContext } from '../../tabs'
import { avatarColor, displayName, fullDate, inboxHref, initials, messageHref, replyHref } from '../shared'
import { LogToCrmButton, MessageActions } from './message-actions'

export const metadata = { title: 'Message · Mail' }

function addressLine(list: MailAddress[]) {
  return list.map((a) => (a.name ? `${a.name} <${a.address}>` : a.address)).join(', ')
}

export default async function ReadMessagePage({
  searchParams,
}: {
  searchParams: Promise<{ box?: string; folder?: string; uid?: string; images?: string }>
}) {
  const ctx = await requireMailContext()
  const sp = await searchParams
  const manage = canManageMailboxes(ctx)
  const box = sp.box ?? ''
  const folder = sp.folder || 'INBOX'
  const uid = Number(sp.uid)
  const allowImages = sp.images === '1'
  const backHref = inboxHref({ box, folder })

  let message: Awaited<ReturnType<typeof readMessage>> | null = null
  let folders: Awaited<ReturnType<typeof listFolders>>['folders'] = []
  let error: string | null = null
  if (!box || !Number.isInteger(uid) || uid < 1) {
    error = 'That message link is incomplete.'
  } else {
    try {
      const [m, f] = await Promise.all([
        readMessage(ctx, box, folder, uid, { allowRemoteImages: allowImages }),
        listFolders(ctx, box),
      ])
      message = m
      folders = f.folders
    } catch (e) {
      error = e instanceof Error ? e.message : 'The message could not be opened.'
    }
  }

  const tabs = <MailTabs current="inbox" showSettings={manage} />

  if (!message) {
    return (
      <div className="space-y-5">
        {tabs}
        <Notice tone="danger" title="Could not open this message">
          {error} It may have been moved or deleted in another mail app.
        </Notice>
        <Link href={backHref} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
          <ArrowLeft aria-hidden /> Back to mail
        </Link>
      </div>
    )
  }

  const current = folders.find((f) => f.path === folder)
  const role = current?.role ?? 'inbox'
  const outgoing = role === 'sent' || role === 'drafts'
  const counterpart = outgoing ? (message.to[0] ?? null) : message.from
  const crm = await matchCrmSenders(ctx, [counterpart?.address ?? '', ...message.cc.map((c) => c.address)])
  const match = counterpart ? crm.get(counterpart.address) : undefined
  const recipients = message.to.length + message.cc.length

  return (
    <div className="space-y-5">
      {tabs}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={backHref} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
          <ArrowLeft aria-hidden /> {current?.label ?? 'Inbox'}
        </Link>
        <MessageActions mailboxId={box} folder={folder} uid={uid} role={role} flagged={message.flagged} backHref={backHref} />
      </div>

      <Card className="overflow-hidden">
        <div className="space-y-4 border-b border-line p-4 sm:p-5">
          <h1 className="text-xl font-semibold leading-snug text-ink">{message.subject}</h1>

          <div className="flex flex-wrap items-start gap-3">
            <span
              className="grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold text-white"
              style={{ backgroundColor: avatarColor(message.from?.address ?? '?') }}
              aria-hidden
            >
              {initials(message.from)}
            </span>
            <div className="min-w-0 flex-1 text-sm">
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-semibold text-ink">{displayName(message.from)}</span>
                {message.from?.name ? <span className="text-ink-muted">&lt;{message.from.address}&gt;</span> : null}
              </p>
              <p className="truncate text-ink-muted">
                To: {addressLine(message.to) || '—'}
                {message.cc.length ? <> · Cc: {addressLine(message.cc)}</> : null}
              </p>
              {message.replyTo[0] && message.replyTo[0].address !== message.from?.address ? (
                <p className="truncate text-xs text-ink-subtle">Replies go to {addressLine(message.replyTo)}</p>
              ) : null}
            </div>
            <time className="whitespace-nowrap text-sm text-ink-muted" dateTime={message.date.toISOString()}>
              {fullDate(message.date)}
            </time>
          </div>

          {match ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-[var(--brand-100)] bg-[var(--brand-50)] px-3 py-2 text-sm">
              <span className="text-ink">
                {match.contactName ? `${match.contactName} · ` : ''}
                <Link href={`/platform/growth/schools/${match.schoolId}`} className="font-medium text-[var(--brand-600)] hover:underline">
                  {match.schoolName}
                </Link>{' '}
                <span className="text-ink-muted">in Growth CRM</span>
              </span>
              {!outgoing ? <LogToCrmButton mailboxId={box} folder={folder} uid={uid} schoolId={match.schoolId} /> : null}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Link href={replyHref(box, folder, uid, 'reply')} className={buttonVariants({ size: 'sm' })}>
              <Reply aria-hidden /> Reply
            </Link>
            {recipients > 1 ? (
              <Link href={replyHref(box, folder, uid, 'all')} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                <ReplyAll aria-hidden /> Reply all
              </Link>
            ) : null}
            <Link href={replyHref(box, folder, uid, 'forward')} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              <Forward aria-hidden /> Forward
            </Link>
          </div>
        </div>

        {message.hasRemoteImages && !allowImages ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-2 px-4 py-2 text-sm text-ink-muted sm:px-5">
            <span className="flex items-center gap-2">
              <ImageOff className="size-4 shrink-0" aria-hidden />
              Images from the internet are hidden, so the sender cannot tell when you opened this.
            </span>
            <Link href={messageHref(box, folder, uid, { images: '1' })} className="font-medium text-[var(--brand-600)] hover:underline">
              Show images
            </Link>
          </div>
        ) : null}

        <iframe
          title={`Message: ${message.subject}`}
          // No scripts and no same-origin access; links may open in a new tab.
          sandbox="allow-popups allow-popups-to-escape-sandbox"
          srcDoc={message.html}
          className="block h-[70vh] min-h-[480px] w-full bg-white"
        />

        {message.attachments.length ? (
          <div className="border-t border-line p-4 sm:p-5">
            <h2 className="mb-2 text-sm font-semibold text-ink">
              {message.attachments.length} attachment{message.attachments.length === 1 ? '' : 's'}
            </h2>
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {message.attachments.map((a) => {
                const href = `/api/v1/platform/mail/inbox/attachment?${new URLSearchParams({
                  box,
                  folder,
                  uid: String(uid),
                  part: String(a.index),
                }).toString()}`
                return (
                  <li key={a.index} className="flex items-center gap-2.5 rounded-[var(--radius-sm)] border border-line p-2">
                    <FileText className="size-5 shrink-0 text-[#f45a1e]" aria-hidden />
                    <a href={`${href}&view=1`} target="_blank" rel="noreferrer" className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink hover:underline">{a.filename}</span>
                      <span className="block text-xs text-ink-subtle">{formatBytes(a.size)}</span>
                    </a>
                    <a
                      href={href}
                      className="grid size-8 shrink-0 place-items-center rounded-[var(--radius-sm)] text-ink-muted hover:bg-surface-2 hover:text-ink"
                      aria-label={`Download ${a.filename}`}
                    >
                      <Download className="size-4" />
                    </a>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : null}
      </Card>
    </div>
  )
}
