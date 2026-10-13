import type { MailAddress } from '@/server/modules/platform/mail/inbox'

export type InboxParams = { box?: string; folder?: string; page?: number; q?: string; unread?: boolean }

export function inboxHref(p: InboxParams): string {
  const params = new URLSearchParams()
  if (p.box) params.set('box', p.box)
  if (p.folder && p.folder !== 'INBOX') params.set('folder', p.folder)
  if (p.q) params.set('q', p.q)
  if (p.unread) params.set('unread', '1')
  if (p.page && p.page > 1) params.set('page', String(p.page))
  const qs = params.toString()
  return `/platform/mail/inbox${qs ? `?${qs}` : ''}`
}

export function messageHref(box: string, folder: string, uid: number, extra?: Record<string, string>): string {
  const params = new URLSearchParams({ box, folder, uid: String(uid), ...extra })
  return `/platform/mail/inbox/read?${params.toString()}`
}

export function replyHref(box: string, folder: string, uid: number, mode: 'reply' | 'all' | 'forward'): string {
  const params = new URLSearchParams({ mode, box, folder, uid: String(uid) })
  return `/platform/mail/compose?${params.toString()}`
}

export function listDate(date: Date): string {
  const now = new Date()
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })
  }
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
    timeZone: 'Asia/Kolkata',
  })
}

export function fullDate(date: Date): string {
  return date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })
}

export function displayName(a: MailAddress | null): string {
  if (!a) return 'Unknown sender'
  return a.name || a.address
}

export function initials(a: MailAddress | null): string {
  const source = a?.name || a?.address || '?'
  const parts = source.replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '')).toUpperCase()
}

/** A stable, muted colour per sender so the list is easy to scan. */
export function avatarColor(seed: string): string {
  const palette = ['#2563eb', '#0891b2', '#059669', '#d97706', '#dc2626', '#7c3aed', '#db2777', '#475569']
  let h = 0
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return palette[h % palette.length]!
}