import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { AuthError, ForbiddenError } from '@/server/context'
import { TenantIsolationError } from '@/server/db/tenant-client'
import { QuotaExceededError } from '@/server/entitlements'

export const API_VERSION = 'v1'

export type ApiError = {
  code: string
  message: string
  details?: unknown
}

export type Meta = {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

/** Every successful API response has the same envelope. */
export function ok<T>(data: T, meta?: Meta, init?: ResponseInit) {
  return NextResponse.json({ data, meta: meta ?? null, error: null }, init)
}

export function fail(status: number, error: ApiError) {
  return NextResponse.json({ data: null, meta: null, error }, { status })
}

export class ApiException extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ApiException'
  }
}

export function badRequest(message: string, details?: unknown) {
  return new ApiException(400, 'BAD_REQUEST', message, details)
}

export function notFound(what = 'Resource') {
  return new ApiException(404, 'NOT_FOUND', `${what} not found`)
}

export function conflict(message: string) {
  return new ApiException(409, 'CONFLICT', message)
}

export function forbidden(message = 'You do not have permission to do this') {
  return new ApiException(403, 'FORBIDDEN', message)
}

/**
 * Translates anything a handler can throw into the standard error envelope.
 * Internal details never reach the client; they go to the server log.
 */
export function toErrorResponse(err: unknown) {
  if (err instanceof ApiException) {
    return fail(err.status, { code: err.code, message: err.message, details: err.details })
  }
  if (err instanceof ZodError) {
    return fail(422, {
      code: 'VALIDATION_ERROR',
      message: 'The submitted data is invalid',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    })
  }
  if (err instanceof AuthError) {
    return fail(401, { code: 'UNAUTHENTICATED', message: err.message })
  }
  if (err instanceof ForbiddenError) {
    return fail(403, { code: 'FORBIDDEN', message: err.message })
  }
  if (err instanceof QuotaExceededError) {
    return fail(err.status, {
      code: 'QUOTA_EXCEEDED',
      message: err.message,
      details: { feature: err.feature, limit: err.limit, current: err.current },
    })
  }
  if (err instanceof TenantIsolationError) {
    // Do not confirm the record exists elsewhere.
    return fail(404, { code: 'NOT_FOUND', message: 'Resource not found' })
  }
  const prismaCode = (err as { code?: string })?.code
  if (prismaCode === 'P2002') {
    return fail(409, { code: 'CONFLICT', message: 'A record with these details already exists' })
  }
  if (prismaCode === 'P2025') {
    return fail(404, { code: 'NOT_FOUND', message: 'Resource not found' })
  }
  console.error('[api] unhandled error', err)
  return fail(500, { code: 'INTERNAL_ERROR', message: 'Something went wrong on our side' })
}

export function paginationMeta(page: number, pageSize: number, total: number): Meta {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  }
}
