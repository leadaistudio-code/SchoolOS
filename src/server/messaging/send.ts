import { env } from '@/lib/env'
import { smsProvider, whatsappProvider } from '@/server/providers'
import type { SendResult } from '@/server/providers/types'

export type ParentMessageInput = {
  to: string
  body: string
  templateName?: string
  variables?: Record<string, string>
}

export type ParentMessageResult = SendResult & {
  channel?: 'whatsapp' | 'sms'
  failedWhatsApp?: string
}

/**
 * Sends to a parent phone: WhatsApp first, SMS when enabled and WhatsApp fails.
 *
 * Used for notices, fee reminders, absence alerts, and OTP fallback so a
 * single call site owns the failover policy.
 */
export async function sendParentMessage(input: ParentMessageInput): Promise<ParentMessageResult> {
  const wa = whatsappProvider()
  if (wa.name !== 'log') {
    const whatsapp = await wa.send({
      to: input.to,
      body: input.body,
      templateName: input.templateName,
      variables: input.variables,
    })
    if (whatsapp.ok) return { ...whatsapp, channel: 'whatsapp' }

    if (env().MESSAGING_WHATSAPP_FAILOVER_SMS) {
      const sms = smsProvider()
      if (sms.name !== 'log') {
        const fallback = await sms.send({ to: input.to, body: input.body })
        if (fallback.ok) {
          return { ...fallback, channel: 'sms', failedWhatsApp: whatsapp.error }
        }
        return { ...fallback, failedWhatsApp: whatsapp.error }
      }
    }

    return { ...whatsapp, failedWhatsApp: whatsapp.error }
  }

  const sms = smsProvider()
  if (sms.name !== 'log') {
    const result = await sms.send({ to: input.to, body: input.body })
    return { ...result, channel: 'sms' }
  }

  return { ok: false, error: 'No messaging provider configured' }
}
