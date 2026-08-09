import type { NextRequest } from 'next/server'
import { requireApiContext, type AppContext } from '@/server/context'
import { rateLimit, RATE_LIMITS } from '@/server/rate-limit'
import { ApiException, toErrorResponse } from './response'

type HandlerOptions = {
  permission?: string
  rateLimitKey?: keyof typeof RATE_LIMITS
}

type Handler = (
  req: NextRequest,
  ctx: AppContext,
  params: Record<string, string>,
) => Promise<Response>

/**
 * Wraps an API route with authentication, tenant binding, permission check,
 * rate limiting and consistent error shaping - so no individual route can
 * forget one of them.
 */
export function route(handler: Handler, options: HandlerOptions = {}) {
  return async (
    req: NextRequest,
    context: { params: Promise<Record<string, string>> },
  ): Promise<Response> => {
    try {
      const ctx = await requireApiContext(options.permission)

      const limitCfg = RATE_LIMITS[options.rateLimitKey ?? 'api']
      const limited = await rateLimit(
        `${options.rateLimitKey ?? 'api'}:${ctx.tenant.id}:${ctx.user.userId}`,
        limitCfg.limit,
        limitCfg.windowSeconds,
      )
      if (!limited.ok) {
        throw new ApiException(429, 'RATE_LIMITED', 'Too many requests, please slow down')
      }

      const params = context?.params ? await context.params : {}
      return await handler(req, ctx, params)
    } catch (err) {
      return toErrorResponse(err)
    }
  }
}

/** Same wrapper for unauthenticated public endpoints (health, webhooks). */
export function publicRoute(
  handler: (req: NextRequest, params: Record<string, string>) => Promise<Response>,
) {
  return async (
    req: NextRequest,
    context: { params: Promise<Record<string, string>> },
  ): Promise<Response> => {
    try {
      const params = context?.params ? await context.params : {}
      return await handler(req, params)
    } catch (err) {
      return toErrorResponse(err)
    }
  }
}
