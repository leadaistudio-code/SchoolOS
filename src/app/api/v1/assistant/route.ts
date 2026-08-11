import { z } from 'zod'
import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ApiException } from '@/server/api/response'
import { assertFeature } from '@/server/entitlements'
import { FEATURE } from '@/lib/features'
import { rateLimit } from '@/server/rate-limit'
import { runAssistant, assistantConfigured, type AgentEvent } from '@/server/assistant/agent'
import { storeDraft } from '@/server/assistant/drafts'

/**
 * The assistant endpoint.
 *
 * Streams newline-delimited JSON rather than Server-Sent Events. The client is
 * one `fetch` in our own code, not an `EventSource`, so SSE's reconnection
 * semantics buy nothing and its framing costs a parser on both ends. One JSON
 * object per line is enough.
 *
 * The request carries the question and the plain-text history. It does **not**
 * carry tool results — see `runAssistant` for why accepting those from a browser
 * would let anything that can reach this route feed the model invented figures.
 */

const bodySchema = z.object({
  question: z.string().trim().min(2, 'Ask a question').max(1000),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        text: z.string().max(4000),
      }),
    )
    .max(20)
    .default([]),
})

export const POST = route(
  async (req: NextRequest, ctx) => {
    // The assistant is a paid module. Checked here rather than in the UI alone,
    // because the UI is not a security boundary.
    await assertFeature(ctx.tenant.id, FEATURE.MODULE_AI_ASSIST)

    if (!assistantConfigured()) {
      throw new ApiException(
        503,
        'UNAVAILABLE',
        'The assistant is not switched on for this deployment yet.',
      )
    }

    // A second, tighter limit on top of the wrapper's: a question costs real
    // money per call, so the ceiling here is per-user questions, not requests.
    const limited = await rateLimit(`assistant:${ctx.tenant.id}:${ctx.user.userId}`, 30, 300)
    if (!limited.ok) {
      throw new ApiException(
        429,
        'RATE_LIMITED',
        'That is a lot of questions in a few minutes. Give it five and try again.',
      )
    }

    const body = bodySchema.parse(await req.json())

    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: AgentEvent) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
        }

        try {
          for await (const event of runAssistant({
            ctx,
            question: body.question,
            history: body.history,
            onDraft: (draft) => storeDraft(ctx, draft),
          })) {
            send(event)
          }
        } catch (error) {
          // The generator handles its own failures; this catches a failure to
          // enqueue — a client that navigated away mid-answer, usually.
          console.error('[assistant] stream aborted', error)
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'content-type': 'application/x-ndjson; charset=utf-8',
        'cache-control': 'no-store, no-transform',
        // Proxies that buffer would defeat the point of streaming.
        'x-accel-buffering': 'no',
      },
    })
  },
  // `assistant.use` gates the feature per role; the tools then gate themselves
  // per permission, so a user with this right still only reads what they may.
  { permission: 'assistant.use', rateLimitKey: 'mutation' },
)
