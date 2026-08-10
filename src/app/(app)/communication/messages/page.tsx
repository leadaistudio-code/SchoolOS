import Link from 'next/link'
import { format, isToday, isYesterday } from 'date-fns'
import { Archive, Inbox, Mail, Send, Star, Users } from 'lucide-react'
import { requireContext } from '@/server/context'
import {
  folderCounts,
  listThreads,
  parseFolder,
  readThread,
  recipientDirectory,
  type Folder,
} from '@/server/modules/messages/service'
import { parseListQuery } from '@/lib/query'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { SearchBar } from '@/components/search-bar'
import { Avatar } from '@/components/ui/identity'
import { cn } from '@/lib/utils'
import { ComposeDialog } from './compose-dialog'
import { ThreadActions } from './thread-actions'
import { ReplyBox } from './reply-box'

export const metadata = { title: 'Messages' }

// Mail is the one screen where a cached view is actively wrong: a thread that
// arrived a minute ago has to be there.
export const dynamic = 'force-dynamic'

const FOLDER_META: Record<Folder, { label: string; icon: React.ElementType }> = {
  inbox: { label: 'Inbox', icon: Inbox },
  unread: { label: 'Unread', icon: Mail },
  starred: { label: 'Starred', icon: Star },
  sent: { label: 'Sent', icon: Send },
  archived: { label: 'Archived', icon: Archive },
}

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireContext('messages.view')
  const params = await searchParams
  const folder = parseFolder(params.folder)
  const query = parseListQuery(params)
  const canSend = ctx.can('messages.send')

  const [{ rows }, counts, recipients] = await Promise.all([
    listThreads(ctx, folder, query),
    folderCounts(ctx),
    canSend ? recipientDirectory(ctx) : Promise.resolve([]),
  ])

  // A thread id in the URL is read through the same participant filter as the
  // list, so a guessed id simply does not resolve.
  const selected = params.thread ? await readThread(ctx, params.thread).catch(() => null) : null

  return (
    <div>
      <PageHeader
        title="Messages"
        description={
          counts.unread > 0
            ? `${counts.unread} unread of ${counts.inbox} in your inbox`
            : `${counts.inbox} conversation${counts.inbox === 1 ? '' : 's'} · nothing unread`
        }
        breadcrumbs={[{ label: 'Communication' }, { label: 'Messages' }]}
        actions={canSend ? <ComposeDialog initialRecipients={recipients} /> : null}
      />

      <div className="grid gap-3 lg:grid-cols-[11rem_minmax(0,22rem)_minmax(0,1fr)]">
        {/* Folders. A horizontal strip on a phone, a rail on a desktop. */}
        <nav aria-label="Mail folders" className="lg:sticky lg:top-[calc(var(--topbar-h)+1rem)] lg:self-start">
          <ul className="scroll-thin flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
            {(Object.keys(FOLDER_META) as Folder[]).map((key) => {
              const meta = FOLDER_META[key]
              const FolderIcon = meta.icon
              const count = counts[key]
              const active = folder === key

              return (
                <li key={key} className="shrink-0 lg:shrink">
                  <Link
                    href={`/communication/messages?folder=${key}`}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-2 rounded-[10px] px-2.5 py-2 text-sm transition-colors',
                      active
                        ? 'bg-[var(--product-50)] font-medium text-[var(--product-600)]'
                        : 'text-ink-muted hover:bg-surface-2 hover:text-ink',
                    )}
                  >
                    <FolderIcon className="size-4 shrink-0" aria-hidden />
                    {meta.label}
                    {count > 0 ? (
                      <span
                        className={cn(
                          'ml-auto text-xs tnum',
                          key === 'unread' && count > 0 ? 'font-semibold text-[var(--product-600)]' : 'text-ink-subtle',
                        )}
                      >
                        {count}
                      </span>
                    ) : null}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Thread list. Hidden on a phone once a thread is open. */}
        <Card className={cn('overflow-hidden', selected && 'hidden lg:block')}>
          <SearchBar placeholder="Search messages" />

          {rows.length === 0 ? (
            <EmptyState
              title={
                query.q
                  ? 'No messages match that search'
                  : folder === 'inbox'
                    ? 'Your inbox is empty'
                    : `Nothing in ${FOLDER_META[folder].label.toLowerCase()}`
              }
              description={
                folder === 'inbox'
                  ? 'Internal messages from colleagues and families arrive here.'
                  : undefined
              }
            />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {rows.map((thread) => {
                const open = selected?.id === thread.id
                const others = thread.participants.slice(0, 3)

                return (
                  <li key={thread.id}>
                    <Link
                      href={`/communication/messages?folder=${folder}&thread=${thread.id}`}
                      aria-current={open ? 'true' : undefined}
                      className={cn(
                        'flex gap-2.5 px-3 py-2.5 transition-colors',
                        open ? 'bg-[var(--product-50)]' : 'hover:bg-surface-2',
                      )}
                    >
                      {others[0] ? (
                        <Avatar
                          firstName={others[0].name.split(' ')[0] ?? others[0].name}
                          lastName={others[0].name.split(' ')[1] ?? ''}
                          avatarUrl={others[0].avatarUrl}
                          className="size-9"
                        />
                      ) : (
                        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-3 text-ink-subtle">
                          <Users className="size-4" aria-hidden />
                        </span>
                      )}

                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span
                            className={cn(
                              'min-w-0 flex-1 truncate text-sm',
                              thread.unread ? 'font-semibold text-ink' : 'text-ink-muted',
                            )}
                          >
                            {others.map((p) => p.name.split(' ')[0]).join(', ') || 'Just you'}
                            {thread.participants.length > 3 ? ` +${thread.participants.length - 3}` : ''}
                          </span>
                          <span className="shrink-0 text-[11px] tnum text-ink-subtle">
                            {shortTime(thread.lastMessageAt)}
                          </span>
                        </span>

                        <span className="mt-0.5 flex items-center gap-1.5">
                          {thread.starred ? (
                            <Star className="size-3 shrink-0 fill-[var(--chart-staff)] text-[var(--chart-staff)]" aria-hidden />
                          ) : null}
                          <span
                            className={cn(
                              'min-w-0 flex-1 truncate text-sm',
                              thread.unread ? 'font-medium text-ink' : 'text-ink-muted',
                            )}
                          >
                            {thread.subject}
                          </span>
                          {thread.messageCount > 1 ? (
                            <span className="shrink-0 text-[11px] tnum text-ink-subtle">
                              {thread.messageCount}
                            </span>
                          ) : null}
                        </span>

                        <span className="mt-0.5 block truncate text-xs text-ink-subtle">
                          {thread.preview}
                        </span>
                      </span>

                      {thread.unread ? (
                        <span
                          className="mt-3 size-2 shrink-0 rounded-full bg-[var(--product-500)]"
                          aria-label="Unread"
                        />
                      ) : null}
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        {/* Thread pane */}
        <Card className="flex min-h-[24rem] flex-col overflow-hidden">
          {!selected ? (
            <EmptyState
              title="No message selected"
              description="Choose a conversation on the left to read it."
              className="my-auto"
            />
          ) : (
            <>
              <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold text-ink">{selected.subject}</h2>
                  <p className="truncate text-xs text-ink-subtle">
                    {selected.participants.map((p) => (p.isMe ? 'You' : p.name)).join(', ')}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Link
                    href={`/communication/messages?folder=${folder}`}
                    className="text-xs text-[var(--product-600)] hover:underline lg:hidden"
                  >
                    Back
                  </Link>
                  {selected.kind === 'GROUP' ? <Badge tone="neutral">Group</Badge> : null}
                  <ThreadActions
                    conversationId={selected.id}
                    starred={selected.starred}
                    archived={selected.archived}
                  />
                </div>
              </div>

              <ol className="scroll-thin flex-1 space-y-3 overflow-y-auto p-4">
                {selected.messages.map((message) => (
                  <li
                    key={message.id}
                    className={cn('flex gap-2.5', message.isMe && 'flex-row-reverse')}
                  >
                    <Avatar
                      firstName={message.senderName.split(' ')[0] ?? message.senderName}
                      lastName={message.senderName.split(' ')[1] ?? ''}
                      avatarUrl={message.senderAvatarUrl}
                      className="size-8"
                    />
                    <div className={cn('min-w-0 max-w-[85%]', message.isMe && 'text-right')}>
                      <p className="text-xs text-ink-subtle">
                        <span className="font-medium text-ink-muted">
                          {message.isMe ? 'You' : message.senderName}
                        </span>
                        {' · '}
                        <span className="tnum">{format(message.createdAt, 'd MMM, HH:mm')}</span>
                      </p>
                      <div
                        className={cn(
                          'mt-1 inline-block whitespace-pre-wrap rounded-[var(--radius)] px-3 py-2 text-left text-sm',
                          message.isMe
                            ? 'bg-[var(--product-500)] text-white'
                            : 'bg-surface-2 text-ink',
                        )}
                      >
                        {message.body}
                      </div>
                      {message.attachments.length > 0 ? (
                        <ul className="mt-1 space-y-0.5">
                          {message.attachments.map((file) => (
                            <li key={file.id} className="text-xs text-ink-subtle">
                              {file.fileName}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>

              {canSend ? <ReplyBox conversationId={selected.id} /> : null}
            </>
          )}
        </Card>
      </div>
    </div>
  )
}

/** Mail timestamps: time for today, weekday this week, date beyond that. */
function shortTime(date: Date): string {
  if (isToday(date)) return format(date, 'HH:mm')
  if (isYesterday(date)) return 'Yesterday'
  return format(date, 'd MMM')
}
