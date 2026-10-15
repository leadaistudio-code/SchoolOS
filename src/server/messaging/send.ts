import { env } from '@/lib/env'
import { smsProvider, whatsappProvider } from '@/server/providers'
import type { SendResult, WhatsAppMessage } from '@/server/providers/types'
import { notificationTemplateVariables } from './notify-template'

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
 * Meta only delivers free-form text within 24 hours of the recipient writing
 * in - and accepts it first, failing later - so on Meta Cloud a message without
 * its own template goes through the notification template when one is set.
 */
export function whatsappMessageFor(input: ParentMessageInput, providerName: string): WhatsAppMessage {
  const template = env().WHATSAPP_NOTIFY_TEMPLATE
  if (input.templateName || providerName !== 'meta_cloud' || !template) {
    return { to: input.to, body: input.body, templateName: input.templateName, variables: input.variables }
  }
  return {
    to: input.to,
    body: input.body,
    templateName: template,
    language: env().WHATSAPP_NOTIFY_TEMPLATE_LANG,
    variables: notificationTemplateVariables(input.body),
    copyCodeButton: false,
  }
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
    const whatsapp = await wa.send(whatsappMessageFor(input, wa.name))
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
