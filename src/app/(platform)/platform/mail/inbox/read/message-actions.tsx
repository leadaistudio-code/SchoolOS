'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, CalendarPlus, Inbox, MailOpen, ShieldCheck, Star, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { logInboundAction, updateMessageAction } from '../../actions'
import type { FolderRole, MessageAction } from '@/server/modules/platform/mail/inbox'

export function MessageActions({
  mailboxId,
  folder,
  uid,
  role,
  flagged,
  backHref,
}: {
  mailboxId: string
  folder: string
  uid: number
  role: FolderRole
  flagged: boolean
  backHref: string
}) {
  const router = useRouter()
  const { push } = useToast()
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState<MessageAction | null>(null)
  const [confirmTrash, setConfirmTrash] = useState(false)

  function run(action: MessageAction) {
    setBusy(action)
    startTransition(async () => {
      const r = await updateMessageAction(mailboxId, folder, uid, action)
      push({ title: r.message, tone: r.ok ? 'success' : 'error' })
      setBusy(null)
      setConfirmTrash(false)
      if (!r.ok) return
      if (action === 'unread' || action === 'trash' || action === 'archive' || action === 'inbox') router.push(backHref)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      <Button size="sm" variant="ghost" loading={busy === 'unread'} disabled={pending} onClick={() => run('unread')}>
        <MailOpen aria-hidden /> Mark unread
      </Button>
      <Button
        size="sm"
        variant="ghost"
        loading={busy === 'flag' || busy === 'unflag'}
        disabled={pending}
        onClick={() => run(flagged ? 'unflag' : 'flag')}
        aria-pressed={flagged}
      >
        <Star className={flagged ? 'fill-amber-400 text-amber-500' : undefined} aria-hidden /> {flagged ? 'Starred' : 'Star'}
      </Button>
      {role === 'junk' ? (
        <Button size="sm" variant="ghost" loading={busy === 'inbox'} disabled={pending} onClick={() => run('inbox')}>
          <ShieldCheck aria-hidden /> Not spam
        </Button>
      ) : null}
      {role === 'trash' || role === 'archive' ? (
        <Button size="sm" variant="ghost" loading={busy === 'inbox'} disabled={pending} onClick={() => run('inbox')}>
          <Inbox aria-hidden /> Move to Inbox
        </Button>
      ) : null}
      {role !== 'archive' && role !== 'trash' && role !== 'sent' && role !== 'drafts' ? (
        <Button size="sm" variant="ghost" loading={busy === 'archive'} disabled={pending} onClick={() => run('archive')}>
          <Archive aria-hidden /> Archive
        </Button>
      ) : null}
      {role !== 'trash' ? (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirmTrash(true)}>
          <Trash2 aria-hidden /> Delete
        </Button>
      ) : null}

      <Dialog
        open={confirmTrash}
        onClose={() => setConfirmTrash(false)}
        title="Move this message to Trash?"
        description="It stays in the mailbox’s Trash folder, where it can be restored from here or from Hostinger webmail."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmTrash(false)}>
              Keep it
            </Button>
            <Button variant="danger" loading={busy === 'trash'} onClick={() => run('trash')}>
              Move to Trash
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-muted">Nothing is permanently deleted from the console.</p>
      </Dialog>
    </div>
  )
}

export function LogToCrmButton({
  mailboxId,
  folder,
  uid,
  schoolId,
}: {
  mailboxId: string
  folder: string
  uid: number
  schoolId: string
}) {
  const { push } = useToast()
  const [pending, startTransition] = useTransition()
  const [done, setDone] = useState(false)
  return (
    <Button
      size="sm"
      variant="secondary"
      loading={pending}
      disabled={done}
      onClick={() =>
        startTransition(async () => {
          const r = await logInboundAction(mailboxId, folder, uid, schoolId)
          push({ title: r.message, tone: r.ok ? 'success' : 'error' })
          if (r.ok) setDone(true)
        })
      }
    >
      <CalendarPlus aria-hidden /> {done ? 'On the timeline' : 'Log on school timeline'}
    </Button>
  )
}
