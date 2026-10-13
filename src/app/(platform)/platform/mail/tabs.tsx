import { redirect } from 'next/navigation'
import { FolderOpen, Inbox, Megaphone, PenSquare, Send, Settings2 } from 'lucide-react'
import { LinkTabs } from '@/components/ui/tabs'
import { requirePlatformContext } from '@/server/context'
import { canManageMailboxes, canUseMail } from '@/server/modules/platform/mail/service'

export async function requireMailContext(opts?: { manage?: boolean }) {
  const ctx = await requirePlatformContext()
  if (!canUseMail(ctx) || (opts?.manage && !canManageMailboxes(ctx))) redirect('/403')
  return ctx
}

export function MailTabs({
  current,
  showSettings,
}: {
  current: 'inbox' | 'sent' | 'compose' | 'campaigns' | 'library' | 'settings'
  showSettings: boolean
}) {
  return (
    <LinkTabs
      label="Mail sections"
      items={[
        { label: 'Inbox', href: '/platform/mail/inbox', active: current === 'inbox', icon: Inbox, accent: '#2563eb' },
        { label: 'Sent from console', href: '/platform/mail', active: current === 'sent', icon: Send, accent: '#002046' },
        { label: 'Compose', href: '/platform/mail/compose', active: current === 'compose', icon: PenSquare, accent: '#f45a1e' },
        { label: 'Bulk email', href: '/platform/mail/campaigns', active: current === 'campaigns', icon: Megaphone, accent: '#7c3aed' },
        { label: 'Library', href: '/platform/mail/library', active: current === 'library', icon: FolderOpen, accent: '#0ea5e9' },
        ...(showSettings
          ? [{ label: 'Mailbox', href: '/platform/mail/settings', active: current === 'settings', icon: Settings2, accent: '#64748b' }]
          : []),
      ]}
    />
  )
}
