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

    async turn({
      system,
      turns,
      tools,
      onText,
      stream = true,
      toolChoice,
      maxOutputTokens,
    }): Promise<ModelTurnResult> {
      const mappedTools = tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters as Anthropic.Tool.InputSchema,
      }))
      const choice =
        toolChoice && tools.some((tool) => tool.name === toolChoice)
          ? { type: 'tool' as const, name: toolChoice }
          : undefined

      const base = {
        model: options.model,
        max_tokens: maxOutputTokens ?? 4096,
        thinking: { type: 'adaptive' as const },
        output_config: { effort: options.effort },
        system: [{ type: 'text' as const, text: system, cache_control: { type: 'ephemeral' as const } }],
        tools: mappedTools.length ? mappedTools : undefined,
        tool_choice: choice,
        messages: toAnthropicMessages(turns),
      }

      // One-shot structured outputs (vision eval, question generate) prefer a
      // complete message over streaming deltas.
      if (!stream) {
        const message = await client.messages.create(base)
        const text = message.content
          .filter((block): block is Anthropic.TextBlock => block.type === 'text')
          .map((block) => block.text)
          .join('')
        if (text) onText(text)
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
          raw: message.content,
          refused: message.stop_reason === 'refusal',
        }
      }

      const streamResponse = client.messages.stream(base)

      for await (const event of streamResponse) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          onText(event.delta.text)
        }
      }

      const message = await streamResponse.finalMessage()

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

function userContent(turn: Extract<ModelTurn, { role: 'user' }>): string | Anthropic.ContentBlockParam[] {
  if (turn.parts && turn.parts.length > 0) {
    return turn.parts.map((part): Anthropic.ContentBlockParam => {
      if (part.type === 'text') return { type: 'text', text: part.text }
      const mediaType = part.mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
      return {
        type: 'image',
        source: {
          type: 'base64',
          media_type: mediaType,
          data: part.base64,
        },
      }
    })
  }
  return turn.text
}

/** Neutral turns → Anthropic messages. Exported for tests. */
export function toAnthropicMessages(turns: ModelTurn[]): Anthropic.MessageParam[] {
  const messages: Anthropic.MessageParam[] = []

  for (const turn of turns) {
    if (turn.role === 'user') {
      messages.push({ role: 'user', content: userContent(turn) })
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
