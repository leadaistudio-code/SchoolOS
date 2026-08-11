/**
 * The model adapter contract.
 *
 * The assistant loop owns everything that matters — which tools exist, whose
 * permissions apply, what gets audited, when a draft is created. All a provider
 * does is one turn: given a system prompt, a conversation and a tool list, stream
 * some text and say which tools it wants called.
 *
 * Keeping the seam this narrow is what makes `AI_DRIVER` a real switch rather
 * than a second implementation of the feature. Both adapters are about a hundred
 * lines, and neither can reach the database.
 */

/** A tool the model asked to run. `arguments` is unvalidated JSON from the model. */
export type ModelToolCall = {
  /** Provider's id for this call. Tool results must quote it back. */
  id: string
  name: string
  /** Raw JSON text. The loop parses it through the tool's Zod schema. */
  argumentsJson: string
}

/**
 * One entry of conversation, in a shape neither provider owns.
 *
 * `raw` carries the provider's own representation of an assistant turn so it can
 * be replayed byte-identically. That matters more than it looks: Anthropic's
 * thinking blocks must be echoed back unchanged on the same model, and
 * reconstructing them from the neutral fields would drop them and risk a 400.
 * The loop never inspects `raw`; only the adapter that produced it does.
 */
export type ModelTurn =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text: string; toolCalls: ModelToolCall[]; raw?: unknown }
  | { role: 'tool'; callId: string; name: string; content: string; isError?: boolean }

/** A tool as the model sees it. */
export type ModelToolSpec = {
  name: string
  description: string
  /** JSON Schema, strict: `additionalProperties: false` plus a `required` list. */
  parameters: Record<string, unknown>
}

/** What a single turn produced. */
export type ModelTurnResult = {
  text: string
  toolCalls: ModelToolCall[]
  /** Provider-native assistant turn, for replay. */
  raw: unknown
  /** True when the provider declined the request on policy grounds. */
  refused: boolean
}

export type ModelAdapter = {
  /** For logs and errors. */
  readonly name: string
  /** The model id in use, so a failure names it. */
  readonly model: string
  /**
   * Streams one turn. Text arrives through `onText` as it is generated; the
   * resolved value is the complete turn including any tool calls.
   */
  turn: (params: {
    system: string
    turns: ModelTurn[]
    tools: ModelToolSpec[]
    onText: (delta: string) => void
  }) => Promise<ModelTurnResult>
}
