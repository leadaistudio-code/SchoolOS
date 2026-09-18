import {
  FunctionCallingConfigMode,
  GoogleGenAI,
  type Content,
  type FunctionDeclaration,
  type Part,
} from '@google/genai'
import type {
  ModelAdapter,
  ModelToolCall,
  ModelToolSpec,
  ModelTurn,
  ModelTurnResult,
} from './types'

/**
 * Google Gemini, through the GenAI SDK (`@google/genai`).
 *
 * Same narrow `ModelAdapter` contract as OpenAI / Anthropic: multimodal user
 * parts (vision evaluation), tool calling owned by our agent loop (AFC off),
 * and optional `AI_BASE_URL` for gateways.
 *
 * Default model is Flash — strong enough for OCR / rubric scoring and cheap
 * enough for school Q&A. Override with `AI_MODEL` (e.g. gemini-2.5-pro).
 */

export function geminiAdapter(options: {
  apiKey: string
  model: string
  baseUrl?: string
}): ModelAdapter {
  const client = new GoogleGenAI({
    apiKey: options.apiKey,
    ...(options.baseUrl
      ? { httpOptions: { baseUrl: options.baseUrl, apiVersion: '' } }
      : {}),
  })

  return {
    name: 'gemini',
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
      const contents = toGeminiContents(turns)
      const declarations = tools.map(toFunctionDeclaration)
      const forced =
        toolChoice && tools.some((tool) => tool.name === toolChoice) ? toolChoice : undefined

      const config = {
        systemInstruction: system,
        maxOutputTokens: maxOutputTokens ?? 8192,
        // Our agent loop executes tools; Gemini must not invent remote callers.
        automaticFunctionCalling: { disable: true as const },
        ...(declarations.length
          ? {
              tools: [{ functionDeclarations: declarations }],
              toolConfig: {
                functionCallingConfig: forced
                  ? {
                      mode: FunctionCallingConfigMode.ANY,
                      allowedFunctionNames: [forced],
                    }
                  : { mode: FunctionCallingConfigMode.AUTO },
              },
            }
          : {}),
      }

      if (!stream) {
        const response = await client.models.generateContent({
          model: options.model,
          contents,
          config,
        })
        const text = response.text ?? ''
        if (text) onText(text)
        const toolCalls = mapFunctionCalls(response.functionCalls)
        return {
          text,
          toolCalls,
          raw: response.candidates?.[0]?.content?.parts ?? [],
          refused: isBlocked(response),
        }
      }

      const streamResponse = await client.models.generateContentStream({
        model: options.model,
        contents,
        config,
      })

      let text = ''
      let toolCalls: ModelToolCall[] = []
      let raw: Part[] = []
      let refused = false

      for await (const chunk of streamResponse) {
        const delta = chunk.text ?? ''
        if (delta) {
          text += delta
          onText(delta)
        }
        const calls = mapFunctionCalls(chunk.functionCalls)
        if (calls.length) toolCalls = calls
        const parts = chunk.candidates?.[0]?.content?.parts
        if (parts?.length) raw = parts
        if (isBlocked(chunk)) refused = true
      }

      return { text, toolCalls, raw, refused }
    },
  }
}

function toFunctionDeclaration(tool: ModelToolSpec): FunctionDeclaration {
  return {
    name: tool.name,
    description: tool.description,
    parametersJsonSchema: tool.parameters,
  }
}

function mapFunctionCalls(
  calls: Array<{ id?: string; name?: string; args?: Record<string, unknown> }> | undefined,
): ModelToolCall[] {
  if (!calls?.length) return []
  return calls
    .filter((call) => call.name)
    .map((call, index) => ({
      id: call.id || `gemini_call_${index}`,
      name: call.name!,
      argumentsJson: JSON.stringify(call.args ?? {}),
    }))
}

function isBlocked(response: {
  promptFeedback?: { blockReason?: string }
  candidates?: Array<{ finishReason?: string }>
}): boolean {
  if (response.promptFeedback?.blockReason) return true
  const reason = response.candidates?.[0]?.finishReason
  return reason === 'SAFETY' || reason === 'BLOCKLIST' || reason === 'PROHIBITED_CONTENT'
}

function userParts(turn: Extract<ModelTurn, { role: 'user' }>): Part[] {
  if (turn.parts && turn.parts.length > 0) {
    return turn.parts.map((part): Part => {
      if (part.type === 'text') return { text: part.text }
      return {
        inlineData: {
          mimeType: part.mimeType,
          data: part.base64,
        },
      }
    })
  }
  return [{ text: turn.text }]
}

/**
 * Neutral turns → Gemini `Content[]`.
 * Exported for unit tests (multimodal + tool round-trip).
 */
export function toGeminiContents(turns: ModelTurn[]): Content[] {
  const contents: Content[] = []

  for (const turn of turns) {
    if (turn.role === 'user') {
      contents.push({ role: 'user', parts: userParts(turn) })
      continue
    }

    if (turn.role === 'assistant') {
      if (Array.isArray(turn.raw) && turn.raw.length > 0) {
        contents.push({ role: 'model', parts: turn.raw as Part[] })
        continue
      }
      const parts: Part[] = []
      if (turn.text) parts.push({ text: turn.text })
      for (const call of turn.toolCalls) {
        parts.push({
          functionCall: {
            id: call.id,
            name: call.name,
            args: safeParse(call.argumentsJson) as Record<string, unknown>,
          },
        })
      }
      contents.push({ role: 'model', parts: parts.length ? parts : [{ text: '' }] })
      continue
    }

    // Tool results: Gemini expects user-role functionResponse parts. Merge
    // consecutive tool turns into one content (parallel tool results).
    const block: Part = {
      functionResponse: {
        id: turn.callId,
        name: turn.name,
        response: turn.isError
          ? { error: turn.content }
          : safeParseObject(turn.content),
      },
    }

    const last = contents[contents.length - 1]
    if (last && last.role === 'user' && Array.isArray(last.parts)) {
      const alreadyHasFunctionResponse = last.parts.some((p) => p.functionResponse)
      if (alreadyHasFunctionResponse) {
        last.parts.push(block)
        continue
      }
    }
    contents.push({ role: 'user', parts: [block] })
  }

  return contents
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json)
  } catch {
    return {}
  }
}

function safeParseObject(content: string): Record<string, unknown> {
  const parsed = safeParse(content)
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>
  }
  return { result: content }
}
