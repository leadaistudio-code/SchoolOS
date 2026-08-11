/**
 * The assistant's wire protocol.
 *
 * One JSON object per line, server to browser. It lives in `lib` because both
 * ends need it and neither should import the other: the agent loop emits these,
 * the panel renders them, and putting the shape in a server module would drag
 * the Anthropic SDK into a type-only import from a client component.
 *
 * `parseAgentEvent` exists because a stream can be cut mid-line and a partial
 * object must be dropped rather than rendered as a turn with undefined fields.
 */

export type AgentEvent =
  /** A tool is running. `label` is human-readable; tool names never reach the UI. */
  | { type: 'tool'; name: string; label: string }
  /** A fragment of the answer, in order. */
  | { type: 'text'; text: string }
  /** Where a figure came from. Emitted by the tool, never written by the model. */
  | { type: 'source'; label: string; href: string }
  /** An action prepared for approval. Nothing has been written. */
  | { type: 'draft'; id: string; kind: string; summary: string }
  | { type: 'done'; turns: number }
  | { type: 'error'; message: string }

/** Narrows one line of the stream, or returns null if it is not a usable event. */
export function parseAgentEvent(line: string): AgentEvent | null {
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
    case 'tool': {
      const name = str('name')
      const label = str('label')
      return name && label ? { type: 'tool', name, label } : null
    }
    case 'text': {
      const text = str('text')
      return text === null ? null : { type: 'text', text }
    }
    case 'source': {
      const label = str('label')
      const href = str('href')
      // Only in-app paths. A stream that somehow carried an absolute URL would
      // otherwise become a link out of the product.
      return label && href?.startsWith('/') ? { type: 'source', label, href } : null
    }
    case 'draft': {
      const id = str('id')
      const kind = str('kind')
      const summary = str('summary')
      return id && kind && summary ? { type: 'draft', id, kind, summary } : null
    }
    case 'done':
      return { type: 'done', turns: typeof event.turns === 'number' ? event.turns : 0 }
    case 'error': {
      const message = str('message')
      return message ? { type: 'error', message } : null
    }
    default:
      return null
  }
}
