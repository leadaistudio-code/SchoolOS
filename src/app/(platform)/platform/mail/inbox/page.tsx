import Link from 'next/link'
import {
  Archive,
  FileText,
  Folder,
  Inbox,
  Paperclip,
  PenSquare,
  RefreshCw,
  Reply,
  Send,
  ShieldAlert,
  Star,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { EmptyState, Notice } from '@/components/ui/states'
import { SearchInput } from '@/components/ui/input'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'
import { canManageMailboxes, listMailboxes } from '@/server/modules/platform/mail/service'
import {
  listFolders,
  listMessages,
  matchCrmSenders,
  type FolderRole,
  type InboxFolder,
} from '@/server/modules/platform/mail/inbox'
import { MailTabs, requireMailContext } from '../tabs'
import { avatarColor, displayName, inboxHref, initials, listDate, messageHref } from './shared'

export const metadata = { title: 'Inbox · Mail' }

const FOLDER_ICONS: Record<FolderRole, LucideIcon> = {
  inbox: Inbox,
  sent: Send,
  drafts: FileText,
  archive: Archive,
  junk: ShieldAlert,
  trash: Trash2,
  other: Folder,
}

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ box?: string; folder?: string; page?: string; q?: string; unread?: string }>
}) {
  const ctx = await requireMailContext()
  const sp = await searchParams
  const manage = canManageMailboxes(ctx)
  const mailboxes = await listMailboxes(ctx)

  const header = (description?: string) => (
    <>
      <PageHeader
        title="Inbox"
        description={description}
        breadcrumbs={[{ label: 'Mail', href: '/platform/mail/inbox' }, { label: 'Inbox' }]}
        actions={
          <Link href="/platform/mail/compose" className={buttonVariants({ size: 'sm' })}>
            <PenSquare aria-hidden /> Compose
          </Link>
        }
      />
      <MailTabs current="inbox" showSettings={manage} />
    </>
  )

  if (mailboxes.length === 0) {
    return (
      <div className="space-y-5">
        {header()}
        <Notice tone="warning" title="No mailbox connected">
          {manage ? (
            <>
              Connect your Hostinger mailbox in{' '}
              <Link href="/platform/mail/settings" className="font-medium underline">
                Mailbox
              </Link>{' '}
              to read and answer your email here.
            </>
          ) : (
            'Ask the Super Admin to connect the company mailbox.'
          )}
        </Notice>
      </div>
    )
  }

  const box = mailboxes.find((m) => m.id === sp.box) ?? mailboxes[0]!
  const folder = sp.folder || 'INBOX'
  const page = Math.max(1, Number(sp.page) || 1)
  const q = sp.q?.trim() || ''
  const unread = sp.unread === '1'

  if (!box.imapEnabled) {
    return (
      <div className="space-y-5">
        {header(box.fromEmail)}
        <Notice tone="warning" title="Reading mail is switched off for this mailbox">
          Turn on “Read the inbox and save sent emails to the Sent folder (IMAP)” for {box.fromEmail} under{' '}
          <Link href="/platform/mail/settings" className="font-medium underline">
            Mailbox
          </Link>
          . The same IMAP connection is used to read your inbox.
        </Notice>
      </div>
    )
  }

  let folders: InboxFolder[] = []
  let list: Awaited<ReturnType<typeof listMessages>> | null = null
  let error: string | null = null
  try {
    const [f, l] = await Promise.all([
      listFolders(ctx, box.id),
      listMessages(ctx, box.id, { folder, page, q, unread }),
    ])
    folders = f.folders
    list = l
  } catch (e) {
    error = e instanceof Error ? e.message : 'The mailbox could not be opened.'
  }

  const current = folders.find((f) => f.path === folder)
  const role = current?.role ?? 'inbox'
  const showRecipient = role === 'sent' || role === 'drafts'
  const crm = list ? await matchCrmSenders(ctx, list.rows.map((r) => (showRecipient ? r.to[0]?.address : r.from?.address) ?? '')) : new Map()
  const inboxUnseen = folders.find((f) => f.role === 'inbox')?.unseen ?? 0
  const pages = list ? Math.max(1, Math.ceil(list.total / list.pageSize)) : 1
  const base = { box: mailboxes.length > 1 ? box.id : undefined, folder, q: q || undefined, unread }

  return (
    <div className="space-y-5">
      {header(`${box.fromEmail}${error ? '' : ` · ${inboxUnseen} unread`}`)}

      {error ? (
        <Notice tone="danger" title="Could not open the mailbox">
          {error}{' '}
          {manage ? (
            <Link href="/platform/mail/settings" className="font-medium underline">
              Check the mailbox settings
            </Link>
          ) : null}
        </Notice>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="space-y-3">
          {mailboxes.length > 1 ? (
            <nav aria-label="Mailboxes" className="space-y-1 rounded-[var(--radius-md,10px)] border border-line bg-surface p-2">
              {mailboxes.map((m) => (
                <Link
                  key={m.id}
                  href={inboxHref({ box: m.id })}
                  className={cn(
                    'block truncate rounded-[var(--radius-sm)] px-2 py-1.5 text-sm',
                    m.id === box.id ? 'bg-surface-2 font-medium text-ink' : 'text-ink-muted hover:bg-surface-2 hover:text-ink',
                  )}
                >
                  {m.fromEmail}
                </Link>
              ))}
            </nav>
          ) : null}
          <nav
            aria-label="Folders"
            className="flex gap-1 overflow-x-auto rounded-[var(--radius-md,10px)] border border-line bg-surface p-2 lg:block lg:space-y-0.5"
          >
            {folders.map((f) => {
              const Icon = FOLDER_ICONS[f.role]
              const active = f.path === folder
              return (
                <Link
                  key={f.path}
                  href={inboxHref({ box: base.box, folder: f.path })}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex shrink-0 items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-sm',
                    active ? 'bg-[var(--brand-50)] font-medium text-[var(--brand-600)]' : 'text-ink-muted hover:bg-surface-2 hover:text-ink',
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  <span className="min-w-0 truncate lg:flex-1">{f.label}</span>
                  {f.unseen > 0 && f.role !== 'sent' && f.role !== 'trash' ? (
                    <span className="rounded-full bg-[var(--brand-600)] px-1.5 text-[11px] font-semibold leading-5 text-white tnum">
                      {f.unseen}
                    </span>
                  ) : null}
                </Link>
              )
            })}
          </nav>
        </aside>

        <Card className="min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
            <form action="/platform/mail/inbox" className="flex min-w-0 flex-1 items-center gap-2">
              {base.box ? <input type="hidden" name="box" value={base.box} /> : null}
              {folder !== 'INBOX' ? <input type="hidden" name="folder" value={folder} /> : null}
              {unread ? <input type="hidden" name="unread" value="1" /> : null}
              <SearchInput name="q" defaultValue={q} placeholder={`Search ${current?.label ?? 'Inbox'} by sender, recipient or subject`} aria-label="Search mail" />
            </form>
            <div className="flex items-center gap-1 rounded-[var(--radius-sm)] border border-line p-0.5 text-sm">
              <Link
                href={inboxHref({ ...base, unread: false, page: 1 })}
                className={cn('rounded-[6px] px-2.5 py-1', !unread ? 'bg-surface-2 font-medium text-ink' : 'text-ink-muted hover:text-ink')}
              >
                All
              </Link>
              <Link
                href={inboxHref({ ...base, unread: true, page: 1 })}
                className={cn('rounded-[6px] px-2.5 py-1', unread ? 'bg-surface-2 font-medium text-ink' : 'text-ink-muted hover:text-ink')}
              >
                Unread
              </Link>
            </div>
            <Link
              href={inboxHref({ ...base, page })}
              className={buttonVariants({ variant: 'ghost', size: 'sm' })}
              aria-label="Refresh"
              title="Check for new mail"
            >
              <RefreshCw aria-hidden />
            </Link>
          </div>

          {list && list.rows.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title={q || unread ? 'No messages match' : `${current?.label ?? 'This folder'} is empty`}
                description={q || unread ? 'Try a different search, or show all messages.' : 'New messages appear here as soon as they arrive.'}
              />
            </div>
          ) : null}

          {list && list.rows.length > 0 ? (
            <ul className="divide-y divide-line" aria-label={`${current?.label ?? 'Inbox'} messages`}>
              {list.rows.map((row) => {
                const person = showRecipient ? (row.to[0] ?? null) : row.from
                const match = person ? crm.get(person.address) : undefined
                return (
                  <li key={row.uid}>
                    <Link
                      href={messageHref(box.id, folder, row.uid)}
                      className={cn(
                        'group flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-surface-2',
                        !row.seen && 'bg-[color-mix(in_srgb,var(--brand-50)_55%,transparent)]',
                      )}
                    >
                      <span className="relative shrink-0">
                        <span
                          className="grid size-9 place-items-center rounded-full text-xs font-semibold text-white"
                          style={{ backgroundColor: avatarColor(person?.address ?? '?') }}
                          aria-hidden
                        >
                          {initials(person)}
                        </span>
                        {!row.seen ? (
                          <span className="absolute -left-0.5 -top-0.5 size-2.5 rounded-full border-2 border-surface bg-[var(--brand-600)]" aria-label="Unread" />
                        ) : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className={cn('truncate text-sm', row.seen ? 'text-ink-muted' : 'font-semibold text-ink')}>
                            {showRecipient ? `To: ${displayName(person)}` : displayName(person)}
                          </span>
                          {match ? (
                            <span className="hidden shrink-0 truncate rounded-full border border-[var(--brand-100)] bg-[var(--brand-50)] px-2 text-[11px] leading-5 text-[var(--brand-600)] sm:inline">
                              {match.schoolName}
                            </span>
                          ) : null}
                        </span>
                        <span className={cn('flex items-center gap-1.5 text-sm', row.seen ? 'text-ink-muted' : 'font-medium text-ink')}>
                          {row.answered ? <Reply className="size-3.5 shrink-0 text-ink-subtle" aria-label="Replied" /> : null}
                          <span className="truncate">{row.subject}</span>
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <span className={cn('whitespace-nowrap text-xs tnum', row.seen ? 'text-ink-subtle' : 'font-semibold text-ink')}>
                          {listDate(row.date)}
                        </span>
                        <span className="flex items-center gap-1 text-ink-subtle">
                          {row.hasAttachments ? <Paperclip className="size-3.5" aria-label="Has attachments" /> : null}
                          {row.flagged ? <Star className="size-3.5 fill-amber-400 text-amber-500" aria-label="Starred" /> : null}
                        </span>
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          ) : null}

          {list && list.total > 0 ? (
            <div className="flex items-center justify-between border-t border-line px-3 py-2 text-sm text-ink-muted">
              <span className="tnum">
                {(list.page - 1) * list.pageSize + 1}–{Math.min(list.page * list.pageSize, list.total)} of {list.total}
              </span>
              <div className="flex gap-2">
                {list.page > 1 ? (
                  <Link href={inboxHref({ ...base, page: list.page - 1 })} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                    Newer
                  </Link>
                ) : null}
                {list.page < pages ? (
                  <Link href={inboxHref({ ...base, page: list.page + 1 })} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                    Older
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  )
}
