import { randomBytes } from 'node:crypto'
import {
  aisensyPayload,
  classifyAiSensyFailure,
  classifyMetaFailure,
  metaTemplatePayload,
  networkFailure,
  type SendFailure,
} from './pure'

/**
 * Receipt delivery providers. The fee and notification services depend only
 * on this interface, so a school moves between Meta and AiSensy by changing
 * its settings, never by changing fee logic.
 */
export type ReceiptMessage = {
  to: string
  params: string[]
  /** Suffix for Meta's URL button. */
  linkToken: string
  /** Full link, for providers that take it as a body parameter. */
  linkUrl: string
  userName: string
}

export type ProviderSendResult = { ok: true; messageId: string | null } | ({ ok: false } & SendFailure)

export interface ReceiptWhatsAppProvider {
  readonly name: 'meta_cloud' | 'aisensy' | 'dry_run'
  send(message: ReceiptMessage): Promise<ProviderSendResult>
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>

const TIMEOUT_MS = 12_000

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json()
  } catch {
    return null
  }
}

export function metaCloudApiProvider(
  cfg: { phoneNumberId: string; accessToken: string; templateName: string; language: string; apiVersion: string },
  fetchImpl: FetchLike = fetch,
): ReceiptWhatsAppProvider {
  const endpoint = `https://graph.facebook.com/${cfg.apiVersion}/${encodeURIComponent(cfg.phoneNumberId)}/messages`
  return {
    name: 'meta_cloud',
    async send(m) {
      let res: Response
      try {
        res = await fetchImpl(endpoint, {
          method: 'POST',
          headers: { authorization: `Bearer ${cfg.accessToken}`, 'content-type': 'application/json' },
          body: JSON.stringify(metaTemplatePayload({
            to: m.to,
            templateName: cfg.templateName,
            language: cfg.language,
            params: m.params,
            linkToken: m.linkToken,
          })),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
      } catch (error) {
        return { ok: false, ...networkFailure(error) }
      }
      const body = await readJson(res)
      if (!res.ok) return { ok: false, ...classifyMetaFailure(res.status, body) }
      const id = (body as { messages?: { id?: unknown }[] } | null)?.messages?.[0]?.id
      return { ok: true, messageId: typeof id === 'string' ? id : null }
    },
  }
}

export const AISENSY_ENDPOINT = 'https://backend.aisensy.com/campaign/t1/api/v2'

export function aiSensyProvider(
  cfg: { apiKey: string; campaignName: string },
  fetchImpl: FetchLike = fetch,
): ReceiptWhatsAppProvider {
  return {
    name: 'aisensy',
    async send(m) {
      let res: Response
      try {
        res = await fetchImpl(AISENSY_ENDPOINT, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(aisensyPayload({
            apiKey: cfg.apiKey,
            campaignName: cfg.campaignName,
            to: m.to,
            userName: m.userName,
            params: m.params,
            linkUrl: m.linkUrl,
          })),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
      } catch (error) {
        return { ok: false, ...networkFailure(error) }
      }
      const body = (await readJson(res)) as Record<string, unknown> | null
      if (!res.ok || body?.success === false || body?.success === 'false') {
        return { ok: false, ...classifyAiSensyFailure(res.ok ? 422 : res.status, body) }
      }
      // AiSensy does not document a message id in its response; keep one if present.
      const id = body?.submitted_message_id ?? body?.messageId ?? body?.id
      return { ok: true, messageId: typeof id === 'string' ? id : null }
    },
  }
}

/** Records what would have been sent. Used everywhere outside production. */
export function dryRunProvider(): ReceiptWhatsAppProvider {
  return {
    name: 'dry_run',
    async send() {
      return { ok: true, messageId: `dryrun_${randomBytes(9).toString('base64url')}` }
    },
  }
}

/**
 * Real messages leave only from a production server that has not been put in
 * dry-run mode. Tests and development always get the dry-run provider.
 */
export function liveSendAllowed(env: { nodeEnv?: string; vitest?: string; dryRun: boolean }): boolean {
  return env.nodeEnv === 'production' && !env.vitest && !env.dryRun
}
