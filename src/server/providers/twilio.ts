import { env } from '@/lib/env'
import type { SendResult, SmsMessage, WhatsAppMessage } from './types'

export type TwilioConfig = {
  accountSid: string
  authToken: string
  authorization: string
}

export function twilioConfig(): TwilioConfig | null {
  const accountSid = env().TWILIO_ACCOUNT_SID
  const authToken = env().TWILIO_AUTH_TOKEN
  if (!accountSid || !authToken) return null
  return {
    accountSid,
    authToken,
    authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
  }
}

/** Digits with a leading + for Twilio E.164 fields. */
export function twilioAddress(phone: string): string {
  const digits = phone.replace(/[^\d]/g, '')
  if (!digits) return phone
  return phone.trim().startsWith('+') ? `+${digits}` : `+${digits}`
}

export function twilioWhatsAppAddress(phone: string): string {
  const e164 = twilioAddress(phone)
  return e164.startsWith('whatsapp:') ? e164 : `whatsapp:${e164}`
}

export function twilioFromWhatsApp(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.startsWith('whatsapp:')) return trimmed
  return `whatsapp:${twilioAddress(trimmed)}`
}

/**
 * Builds the form body for Twilio's Messages API.
 *
 * Exported so tests can assert the wire format without calling Twilio.
 */
export function twilioMessageForm(input: {
  from: string
  to: string
  body?: string
  contentSid?: string
  contentVariables?: Record<string, string>
  messagingServiceSid?: string
}): URLSearchParams {
  const form = new URLSearchParams()
  if (input.messagingServiceSid) {
    form.set('MessagingServiceSid', input.messagingServiceSid)
  } else {
    form.set('From', input.from)
  }
  form.set('To', input.to)

  if (input.contentSid) {
    form.set('ContentSid', input.contentSid)
    if (input.contentVariables && Object.keys(input.contentVariables).length > 0) {
      form.set('ContentVariables', JSON.stringify(input.contentVariables))
    }
  } else if (input.body) {
    form.set('Body', input.body)
  }

  return form
}

export async function twilioSendMessage(input: {
  from: string
  to: string
  body?: string
  contentSid?: string
  contentVariables?: Record<string, string>
}): Promise<SendResult> {
  const cfg = twilioConfig()
  if (!cfg) return { ok: false, error: 'Twilio credentials are not configured' }

  const messagingServiceSid = env().TWILIO_MESSAGING_SERVICE_SID
  const form = twilioMessageForm({ ...input, messagingServiceSid: messagingServiceSid ?? undefined })

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          authorization: cfg.authorization,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
        signal: AbortSignal.timeout(15_000),
      },
    )

    const json = (await response.json().catch(() => null)) as {
      sid?: string
      message?: string
      code?: number
      more_info?: string
    } | null

    if (!response.ok) {
      const detail = json?.message ?? `Twilio returned HTTP ${response.status}`
      return { ok: false, error: detail }
    }

    return { ok: true, providerMessageId: json?.sid }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export function twilioSmsProvider(): { name: string; send: (message: SmsMessage) => Promise<SendResult> } {
  return {
    name: 'twilio',
    async send(message) {
      const from = env().TWILIO_SMS_FROM ?? env().SMS_SENDER_ID
      if (!from && !env().TWILIO_MESSAGING_SERVICE_SID) {
        return { ok: false, error: 'Set TWILIO_SMS_FROM or TWILIO_MESSAGING_SERVICE_SID' }
      }

      return twilioSendMessage({
        from: twilioAddress(from ?? ''),
        to: twilioAddress(message.to),
        body: message.body,
      })
    },
  }
}

/**
 * Twilio WhatsApp uses the same Messages API with whatsapp: prefixes.
 *
 * Template sends use a Content SID from Twilio's Content Template Builder
 * (starts with HX). Set WHATSAPP_OTP_TEMPLATE to that SID for OTP flows.
 * Free-form Body works inside the 24-hour customer window only.
 */
export function twilioWhatsAppProvider(): {
  name: string
  send: (message: WhatsAppMessage) => Promise<SendResult>
} {
  return {
    name: 'twilio',
    async send(message) {
      const rawFrom = env().TWILIO_WHATSAPP_FROM
      if (!rawFrom && !env().TWILIO_MESSAGING_SERVICE_SID) {
        return { ok: false, error: 'Set TWILIO_WHATSAPP_FROM or TWILIO_MESSAGING_SERVICE_SID' }
      }

      const from = rawFrom ? twilioFromWhatsApp(rawFrom) : ''
      const to = twilioWhatsAppAddress(message.to)
      const template = message.templateName?.trim()

      if (template && (template.startsWith('HX') || env().TWILIO_WHATSAPP_USE_CONTENT_SID)) {
        return twilioSendMessage({
          from,
          to,
          contentSid: template,
          contentVariables: message.variables,
        })
      }

      return twilioSendMessage({
        from,
        to,
        body: message.body,
      })
    },
  }
}

export function twilioConfigured(): boolean {
  return twilioConfig() !== null
}
