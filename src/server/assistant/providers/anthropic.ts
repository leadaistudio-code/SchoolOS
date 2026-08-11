import Anthropic from '@anthropic-ai/sdk'
import type {
  ModelAdapter,
  ModelToolCall,
  ModelToolSpec,
  ModelTurn,
  ModelTurnResult,
} from './types'

/**
 * Anthropic, through the Messages API.
 *
 * Adaptive thinking is on, with the effort level the school configured: answering
 * from tool results is not deep reasoning and somebody is waiting for the reply.
 *
 * The system prompt and tool list are identical for every question a given user
 * asks, so they carry a cache breakpoint — repeat questions in a session pay a
 * fraction for that prefix.
 */

export function anthropicAdapter(options: {
  apiKey: string
  model: string
  effort: 'low' | 'medium' | 'high'
  baseUrl?: string
}): ModelAdapter {
  const client = new Anthropic({
    apiKey: options.apiKey,
    ...(options.baseUrl ? { baseURL: options.baseUrl } : {}),
  })

  return {
    name: 'anthropic',
    model: options.model,

    async turn({ system, turns, tools, onText }): Promise<ModelTurnResult> {
      const stream = client.messages.stream({
        model: options.model,
        max_tokens: 4096,
        thinking: { type: 'adaptive' },
        output_config: { effort: options.effort },
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        tools: tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.parameters as Anthropic.Tool.InputSchema,
        })),
        messages: toAnthropicMessages(turns),
      })

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          onText(event.delta.text)
        }
      }

      const message = await stream.finalMessage()

      const text = message.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('')

      const toolCalls: ModelToolCall[] = message.content
        .filter((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use')
        .map((block) => ({
          id: block.id,
          name: block.name,
          argumentsJson: JSON.stringify(block.input ?? {}),
        }))

      return {
        text,
        toolCalls,
        // The whole content array, thinking blocks included: they must be echoed
        // back unchanged on the same model, and rebuilding them would drop them.
        raw: message.content,
        refused: message.stop_reason === 'refusal',
      }
    },
  }
}

/** Neutral turns → Anthropic messages. Exported for tests. */
export function toAnthropicMessages(turns: ModelTurn[]): Anthropic.MessageParam[] {
  const messages: Anthropic.MessageParam[] = []

  for (const turn of turns) {
    if (turn.role === 'user') {
      messages.push({ role: 'user', content: turn.text })
      continue
    }

    if (turn.role === 'assistant') {
      messages.push({
        role: 'assistant',
        content: Array.isArray(turn.raw)
          ? (turn.raw as Anthropic.ContentBlockParam[])
          : [
              ...(turn.text ? [{ type: 'text' as const, text: turn.text }] : []),
              ...turn.toolCalls.map((call) => ({
                type: 'tool_use' as const,
                id: call.id,
                name: call.name,
                input: safeParse(call.argumentsJson),
              })),
            ],
      })
      continue
    }

    // Tool results are user-role content blocks, and every result for one
    // assistant turn belongs in a single message — splitting them teaches the
    // model to stop calling tools in parallel. Consecutive tool turns are
    // therefore merged into the message that is already open.
    const block: Anthropic.ToolResultBlockParam = {
      type: 'tool_result',
      tool_use_id: turn.callId,
      content: turn.content,
      ...(turn.isError ? { is_error: true } : {}),
    }

    const last = messages[messages.length - 1]
    if (last && last.role === 'user' && Array.isArray(last.content)) {
      ;(last.content as Anthropic.ContentBlockParam[]).push(block)
    } else {
      messages.push({ role: 'user', content: [block] })
    }
  }

  return messages
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json)
  } catch {
    return {}
  }
}
