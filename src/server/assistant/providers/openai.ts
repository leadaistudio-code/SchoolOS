import OpenAI from 'openai'
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions'
import type {
  ModelAdapter,
  ModelToolCall,
  ModelToolSpec,
  ModelTurn,
  ModelTurnResult,
} from './types'

/**
 * OpenAI, through Chat Completions with function calling.
 *
 * Chat Completions rather than the Responses API on purpose: this loop keeps its
 * own conversation state and replays it every turn (a school's figures must be
 * refetched, never remembered), so server-side conversation storage buys nothing
 * and costs portability. Function calling here is also the shape every
 * OpenAI-compatible gateway implements, so a school pointing `AI_BASE_URL` at
 * Azure OpenAI or a self-hosted proxy works without touching this file.
 *
 * Two details that bite in streaming tool calls:
 *
 *   1. Arguments arrive as fragments across many deltas and must be concatenated
 *      per `index`, not per id — the id is only present on the first fragment.
 *   2. A tool call can be complete while `finish_reason` is still null, so the
 *      accumulator is the source of truth for what was requested.
 */

export function openaiAdapter(options: {
  apiKey: string
  model: string
  baseUrl?: string
}): ModelAdapter {
  const client = new OpenAI({
    apiKey: options.apiKey,
    ...(options.baseUrl ? { baseURL: options.baseUrl } : {}),
  })

  return {
    name: 'openai',
    model: options.model,

    async turn({ system, turns, tools, onText }): Promise<ModelTurnResult> {
      const stream = await client.chat.completions.create({
        model: options.model,
        // No temperature: the assistant reports figures, and sampling variety is
        // not a feature when the answer is "₹4,20,000 outstanding".
        messages: [{ role: 'system', content: system }, ...toOpenAiMessages(turns)],
        tools: tools.length ? toOpenAiTools(tools) : undefined,
        // Let it call several read tools in one turn — outstanding fees and
        // unmarked registers are independent lookups.
        parallel_tool_calls: tools.length ? true : undefined,
        stream: true,
      })

      let text = ''
      // Keyed by the delta index, because ids only arrive on the first fragment.
      const partials = new Map<number, { id: string; name: string; args: string }>()
      let refused = false

      for await (const chunk of stream) {
        const choice = chunk.choices[0]
        if (!choice) continue

        const delta = choice.delta

        if (delta?.content) {
          text += delta.content
          onText(delta.content)
        }

        // Some models expose a refusal channel separate from content.
        if ('refusal' in (delta ?? {}) && typeof delta?.refusal === 'string' && delta.refusal) {
          refused = true
          text += delta.refusal
        }

        for (const call of delta?.tool_calls ?? []) {
          const existing = partials.get(call.index) ?? { id: '', name: '', args: '' }
          partials.set(call.index, {
            id: call.id ?? existing.id,
            name: call.function?.name ?? existing.name,
            args: existing.args + (call.function?.arguments ?? ''),
          })
        }

        if (choice.finish_reason === 'content_filter') refused = true
      }

      const toolCalls: ModelToolCall[] = [...partials.entries()]
        .sort(([a], [b]) => a - b)
        .filter(([, call]) => call.id && call.name)
        .map(([, call]) => ({
          id: call.id,
          name: call.name,
          // An empty fragment stream means a no-argument tool; `{}` parses.
          argumentsJson: call.args || '{}',
        }))

      // The assistant turn as OpenAI wants it echoed back next turn. Content must
      // be null rather than an empty string when there are only tool calls.
      const raw: ChatCompletionMessageParam = {
        role: 'assistant',
        content: text || null,
        ...(toolCalls.length
          ? {
              tool_calls: toolCalls.map((call) => ({
                id: call.id,
                type: 'function' as const,
                function: { name: call.name, arguments: call.argumentsJson },
              })),
            }
          : {}),
      }

      return { text, toolCalls, raw, refused }
    },
  }
}

/**
 * Neutral turns → OpenAI messages.
 *
 * Exported for tests: the ordering rule here is load-bearing. Every `tool`
 * message must follow the assistant turn that requested it and quote its
 * `tool_call_id`, or the API rejects the whole request.
 */
export function toOpenAiMessages(turns: ModelTurn[]): ChatCompletionMessageParam[] {
  return turns.map((turn): ChatCompletionMessageParam => {
    if (turn.role === 'user') return { role: 'user', content: turn.text }

    if (turn.role === 'tool') {
      return {
        role: 'tool',
        tool_call_id: turn.callId,
        // Errors are reported to the model as content; there is no error flag on
        // an OpenAI tool message, so the text says so plainly.
        content: turn.isError ? `Error: ${turn.content}` : turn.content,
      }
    }

    // Replay the provider's own assistant message when this turn came from
    // OpenAI; rebuild it when the history crossed providers.
    if (turn.raw && typeof turn.raw === 'object' && 'role' in (turn.raw as object)) {
      return turn.raw as ChatCompletionMessageParam
    }

    return {
      role: 'assistant',
      content: turn.text || null,
      ...(turn.toolCalls.length
        ? {
            tool_calls: turn.toolCalls.map((call) => ({
              id: call.id,
              type: 'function' as const,
              function: { name: call.name, arguments: call.argumentsJson },
            })),
          }
        : {}),
    }
  })
}

export function toOpenAiTools(tools: ModelToolSpec[]): ChatCompletionTool[] {
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: toStrictSchema(tool.parameters),
      // Enforce the schema at OpenAI rather than hoping: a tool that reads a
      // class id must not receive an invented field.
      strict: true,
    },
  }))
}

/**
 * Rewrites a schema to satisfy OpenAI's strict-mode rules.
 *
 * Strict mode requires **every** property to appear in `required` — there is no
 * such thing as an omitted field. An optional argument is expressed instead as
 * one that may be null, so `{ date?: string }` becomes a required `date` of type
 * `["string", "null"]`.
 *
 * The loop strips those nulls back out before validating against the tool's Zod
 * schema, so `.optional()` keeps meaning what it says in `tools.ts` and neither
 * end has to know about this translation. Getting it wrong is not subtle: OpenAI
 * rejects the whole request with `400 Invalid schema for function …`.
 */
export function toStrictSchema(schema: Record<string, unknown>): Record<string, unknown> {
  if (schema.type === 'array' && schema.items && typeof schema.items === 'object') {
    return {
      ...schema,
      items: toStrictSchema(schema.items as Record<string, unknown>),
    }
  }

  if (schema.type !== 'object' || typeof schema.properties !== 'object' || !schema.properties) {
    return schema
  }

  const properties = schema.properties as Record<string, Record<string, unknown>>
  const required = new Set((schema.required as string[] | undefined) ?? [])

  const rewritten: Record<string, unknown> = {}
  for (const [key, property] of Object.entries(properties)) {
    // Nested objects *and* array-of-object items must also be strict — OpenAI
    // rejects the whole tool if an inner `required` list omits any property.
    let nested: Record<string, unknown>
    if (property.type === 'object') {
      nested = toStrictSchema(property)
    } else if (property.type === 'array' && property.items && typeof property.items === 'object') {
      nested = {
        ...property,
        items: toStrictSchema(property.items as Record<string, unknown>),
      }
    } else {
      nested = { ...property }
    }

    rewritten[key] = required.has(key) ? nested : nullable(nested)
  }

  return {
    ...schema,
    properties: rewritten,
    // Every key, in declaration order.
    required: Object.keys(properties),
    additionalProperties: false,
  }
}

/** Widens a property so null is a legal value for it. */
function nullable(property: Record<string, unknown>): Record<string, unknown> {
  const widened: Record<string, unknown> = { ...property }

  widened.type = Array.isArray(property.type)
    ? [...(property.type as string[]), 'null']
    : [property.type as string, 'null']

  // An enum has to accept null too, or the union is unsatisfiable for null.
  if (Array.isArray(property.enum)) {
    widened.enum = [...(property.enum as unknown[]), null]
  }

  return widened
}
