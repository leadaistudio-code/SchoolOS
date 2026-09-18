import { env } from '@/lib/env'
import { anthropicAdapter } from './anthropic'
import { geminiAdapter } from './gemini'
import { openaiAdapter } from './openai'
import type { ModelAdapter } from './types'

export type {
  ModelAdapter,
  ModelTurn,
  ModelToolCall,
  ModelToolSpec,
  ModelTurnResult,
  ModelContentPart,
} from './types'

/**
 * Which model the assistant runs on.
 *
 * Chosen by `AI_DRIVER`, so switching provider is a deployment decision rather
 * than a code change. The assistant's behaviour — its tools, its permissions, its
 * grounding rules, its draft-then-approve flow — is identical either way; only
 * the wire format differs.
 */

type AiDriver = 'anthropic' | 'openai' | 'gemini'

/**
 * Default model per driver.
 *
 * Deliberately conservative, and overridable with `AI_MODEL`: which models a key
 * can reach depends on the account, and a default that 404s is worse than one
 * that is merely not the newest. Set `AI_MODEL` to whatever your key has.
 */
const DEFAULT_MODEL: Record<AiDriver, string> = {
  // Fast defaults for school Q&A + vision eval. Override with AI_MODEL for depth.
  anthropic: 'claude-sonnet-4-5',
  openai: 'gpt-4.1-mini',
  gemini: 'gemini-2.5-flash',
}

export function assistantConfigured(): boolean {
  const { AI_DRIVER, AI_API_KEY } = env()
  return (
    (AI_DRIVER === 'anthropic' || AI_DRIVER === 'openai' || AI_DRIVER === 'gemini') &&
    Boolean(AI_API_KEY)
  )
}

/** Names the configured driver and model, for the settings screen and logs. */
export function assistantDescribe(): { driver: string; model: string } | null {
  const { AI_DRIVER } = env()
  if (!assistantConfigured() || AI_DRIVER === 'none') return null
  return { driver: AI_DRIVER, model: modelId(AI_DRIVER as AiDriver) }
}

function modelId(driver: AiDriver): string {
  return env().AI_MODEL?.trim() || DEFAULT_MODEL[driver]
}

export function assistantModel(): ModelAdapter {
  const { AI_DRIVER, AI_API_KEY, AI_EFFORT, AI_BASE_URL } = env()

  if (!AI_API_KEY) {
    throw new Error('The assistant needs AI_API_KEY. See docs/ASSISTANT.md.')
  }

  switch (AI_DRIVER) {
    case 'anthropic':
      return anthropicAdapter({
        apiKey: AI_API_KEY,
        model: modelId('anthropic'),
        effort: AI_EFFORT,
        baseUrl: AI_BASE_URL,
      })
    case 'openai':
      return openaiAdapter({
        apiKey: AI_API_KEY,
        model: modelId('openai'),
        baseUrl: AI_BASE_URL,
      })
    case 'gemini':
      return geminiAdapter({
        apiKey: AI_API_KEY,
        model: modelId('gemini'),
        baseUrl: AI_BASE_URL,
      })
    default:
      throw new Error(
        `The assistant is switched off. Set AI_DRIVER to anthropic, openai, or gemini (currently "${AI_DRIVER}").`,
      )
  }
}
