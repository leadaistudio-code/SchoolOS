import { hmacSha256, timingSafeEqual } from '@/server/crypto'

/** Meta signs every webhook body with the app secret as `sha256=<hex>`. */
export function metaSignatureValid(rawBody: string, header: string | null, appSecret: string | undefined) {
  if (!appSecret || !header?.startsWith('sha256=')) return false
  return timingSafeEqual(header.slice(7), hmacSha256(rawBody, appSecret))
}
