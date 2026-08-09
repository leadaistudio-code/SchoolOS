/**
 * Provider contracts. Business logic depends only on these interfaces, so a
 * school can switch from one SMS vendor or payment gateway to another by
 * changing configuration - never by editing a module.
 */

export type EmailMessage = {
  to: string | string[]
  subject: string
  html: string
  text?: string
  replyTo?: string
  attachments?: { filename: string; content: Buffer; contentType: string }[]
}

export type SendResult = {
  ok: boolean
  providerMessageId?: string
  error?: string
}

export interface EmailProvider {
  readonly name: string
  send(message: EmailMessage): Promise<SendResult>
}

export type SmsMessage = { to: string; body: string; templateId?: string }

export interface SmsProvider {
  readonly name: string
  send(message: SmsMessage): Promise<SendResult>
}

export type WhatsAppMessage = {
  to: string
  templateName?: string
  body: string
  variables?: Record<string, string>
  mediaUrl?: string
}

export interface WhatsAppProvider {
  readonly name: string
  send(message: WhatsAppMessage): Promise<SendResult>
}

export type PaymentOrderInput = {
  tenantId: string
  amountMinor: number
  currency: string
  reference: string
  customer: { name: string; email?: string | null; phone?: string | null }
  returnUrl: string
  notes?: Record<string, string>
}

export type PaymentOrder = {
  providerOrderId: string
  checkoutUrl?: string
  raw: unknown
}

export type PaymentVerification = {
  verified: boolean
  providerPaymentId?: string
  amountMinor?: number
  status: 'SUCCESS' | 'FAILED' | 'PENDING'
  raw: unknown
}

export interface PaymentProvider {
  readonly name: string
  createOrder(input: PaymentOrderInput): Promise<PaymentOrder>
  /** Verifies a signed webhook body. MUST NOT trust anything unsigned. */
  verifyWebhook(rawBody: string, signature: string | null): Promise<PaymentVerification>
  /** Server-to-server confirmation, used as the source of truth on return. */
  fetchPayment(providerPaymentId: string): Promise<PaymentVerification>
  refund(providerPaymentId: string, amountMinor: number): Promise<SendResult>
}

export type StoredObject = {
  key: string
  url: string
  sizeBytes: number
  mimeType: string
}

export interface StorageProvider {
  readonly name: string
  put(key: string, body: Buffer, mimeType: string): Promise<StoredObject>
  get(key: string): Promise<Buffer>
  delete(key: string): Promise<void>
  /** Time-limited URL. Documents are never served from a public bucket path. */
  signedUrl(key: string, expiresInSeconds: number): Promise<string>
}

export type Coordinates = { latitude: number; longitude: number }

export interface MapsProvider {
  readonly name: string
  reverseGeocode(point: Coordinates): Promise<string | null>
  estimateArrival(from: Coordinates, to: Coordinates): Promise<number | null>
}

export interface AiProvider {
  readonly name: string
  complete(prompt: string, options?: { system?: string; maxTokens?: number }): Promise<string>
}
