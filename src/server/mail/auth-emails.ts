import { env } from '@/lib/env'
import type { EmailMessage } from '@/server/providers/types'

/**
 * Account emails: reset links and invitations.
 *
 * Deliberately plain. These arrive at parents on cheap phones and at school
 * offices behind aggressive spam filters, so there is no image, no tracking
 * pixel and no remote stylesheet — the kinds of things that get a message
 * classified as marketing and quietly binned. The URL is shown as text as well
 * as linked, because some mail clients strip anchors from unknown senders.
 */

type Recipient = { email: string; firstName: string }
type Context = { schoolName: string; url: string; expiresAt: Date }

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** "60 minutes" / "7 days" — whichever reads more naturally at that length. */
function describeWindow(expiresAt: Date): string {
  const minutes = Math.max(1, Math.round((expiresAt.getTime() - Date.now()) / 60_000))
  if (minutes < 90) return `${minutes} minutes`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours} hours`
  return `${Math.round(hours / 24)} days`
}

function layout(heading: string, paragraphs: string[], url: string, cta: string): string {
  const body = paragraphs.map((p) => `<p style="margin:0 0 14px">${p}</p>`).join('')
  return `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:15px;line-height:1.55;color:#1a1a1a;max-width:520px">
<h1 style="font-size:19px;margin:0 0 16px">${escapeHtml(heading)}</h1>
${body}
<p style="margin:24px 0"><a href="${escapeHtml(url)}" style="background:#1f6feb;color:#fff;text-decoration:none;padding:11px 20px;border-radius:6px;display:inline-block;font-weight:600">${escapeHtml(cta)}</a></p>
<p style="margin:0 0 14px;font-size:13px;color:#555">If the button does not work, copy this link into your browser:<br><span style="word-break:break-all">${escapeHtml(url)}</span></p>
</div>`
}

export function passwordResetEmail(to: Recipient, ctx: Context): EmailMessage {
  const window = describeWindow(ctx.expiresAt)
  const subject = `Reset your ${ctx.schoolName} password`

  return {
    to: to.email,
    subject,
    text: [
      `Hello ${to.firstName},`,
      '',
      `Somebody asked to reset the password for your ${ctx.schoolName} account.`,
      `Open this link within ${window} to choose a new one:`,
      '',
      ctx.url,
      '',
      'If this was not you, ignore this email — your password has not changed and the link will expire on its own.',
      '',
      `— ${ctx.schoolName}`,
    ].join('\n'),
    html: layout(
      `Reset your password`,
      [
        `Hello ${escapeHtml(to.firstName)},`,
        `Somebody asked to reset the password for your <strong>${escapeHtml(ctx.schoolName)}</strong> account. Choose a new one within <strong>${window}</strong>.`,
        `If this was not you, ignore this email — your password has not changed and the link will expire on its own.`,
      ],
      ctx.url,
      'Choose a new password',
    ),
  }
}

export function inviteEmail(to: Recipient, ctx: Context): EmailMessage {
  const window = describeWindow(ctx.expiresAt)

  return {
    to: to.email,
    subject: `Set up your ${ctx.schoolName} account`,
    text: [
      `Hello ${to.firstName},`,
      '',
      `${ctx.schoolName} has created an account for you on ${env().APP_NAME}.`,
      `Open this link within ${window} to set your password and sign in:`,
      '',
      ctx.url,
      '',
      'If you were not expecting this, you can ignore this email.',
      '',
      `— ${ctx.schoolName}`,
    ].join('\n'),
    html: layout(
      `Set up your account`,
      [
        `Hello ${escapeHtml(to.firstName)},`,
        `<strong>${escapeHtml(ctx.schoolName)}</strong> has created an account for you on ${escapeHtml(env().APP_NAME)}. Set your password within <strong>${window}</strong> to sign in.`,
        `If you were not expecting this, you can ignore this email.`,
      ],
      ctx.url,
      'Set my password',
    ),
  }
}
