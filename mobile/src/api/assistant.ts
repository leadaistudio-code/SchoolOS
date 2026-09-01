import { getStoredSession } from '@/auth/storage'
import { API_BASE_URL, REQUEST_TIMEOUT_MS } from '@/config'
import { ApiError } from './client'

type AgentEvent =
  | { type: 'tool'; name: string; label: string }
  | { type: 'text'; text: string }
  | { type: 'source'; label: string; href: string }
  | { type: 'draft'; id: string; kind: string; summary: string }
  | { type: 'done'; turns: number }
  | { type: 'error'; message: string }

function parseAgentEvent(line: string): AgentEvent | null {
  if (!line.trim()) return null
  let raw: unknown
  try {
    raw = JSON.parse(line)
  } catch {
    return null
  }
  if (!raw || typeof raw !== 'object') return null
  const event = raw as Record<string, unknown>
  const str = (key: string) => (typeof event[key] === 'string' ? (event[key] as string) : null)

  switch (event.type) {
    case 'text': {
      const text = str('text')
      return text === null ? null : { type: 'text', text }
    }
    case 'error': {
      const message = str('message')
      return message ? { type: 'error', message } : null
    }
    case 'tool': {
      const name = str('name')
      const label = str('label')
      return name && label ? { type: 'tool', name, label } : null
    }
    default:
      return null
  }
}

export type AskAssistantOptions = {
  question: string
  history?: { role: 'user' | 'assistant'; text: string }[]
  onActivity?: (label: string) => void
  onPartial?: (text: string) => void
  signal?: AbortSignal
}

/** Streams the assistant NDJSON endpoint and returns the full answer text. */
export async function askAssistantStream(options: AskAssistantOptions): Promise<string> {
  const session = await getStoredSession()
  const headers: Record<string, string> = {
    accept: 'application/x-ndjson',
    'content-type': 'application/json',
  }
  if (session?.token) headers.authorization = `Bearer ${session.token}`
  if (session?.tenantSlug) headers['x-tenant-slug'] = session.tenantSlug

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  if (options.signal) {
    options.signal.addEventListener('abort', () => controller.abort(), { once: true })
  }

  let response: Response
  try {
    response = await fetch(`${API_BASE_URL.replace(/\/$/, '')}/assistant`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        question: options.question,
        history: options.history ?? [],
        language: 'en-IN',
      }),
      signal: controller.signal,
    })
  } catch (error) {
    clearTimeout(timeout)
    const aborted = (error as Error)?.name === 'AbortError'
    throw new ApiError(
      0,
      aborted ? 'TIMEOUT' : 'OFFLINE',
      aborted
        ? 'The server took too long to reply. Check your connection and try again.'
        : 'No connection. Check your network and try again.',
    )
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    const raw = await response.text()
    let message = 'The assistant could not answer that.'
    try {
      const body = JSON.parse(raw) as { error?: { message?: string } }
      if (body.error?.message) message = body.error.message
    } catch {
      // Not JSON — keep default.
    }
    throw new ApiError(response.status, 'HTTP_ERROR', message)
  }

  if (!response.body) {
    throw new ApiError(500, 'NO_BODY', 'The assistant returned an empty response.')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let answer = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const event = parseAgentEvent(line)
      if (!event) continue
      switch (event.type) {
        case 'tool':
          options.onActivity?.(event.label)
          break
        case 'text':
          answer += event.text
          options.onPartial?.(answer)
          break
        case 'error':
          throw new ApiError(500, 'ASSISTANT_ERROR', event.message)
        default:
          break
      }
    }
  }

  return answer.trim()
}
