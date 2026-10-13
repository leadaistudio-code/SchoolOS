/**
 * Indian mobile numbers arrive as "98765 43210", "+91-98765-43210",
 * "919876543210" or "whatsapp:+919876543210". The last ten digits identify the
 * line; everything before them is country code or formatting.
 */
export function phoneKey(raw: string | null | undefined): string | null {
  const digits = (raw ?? '').replace(/\D/g, '')
  return digits.length >= 10 ? digits.slice(-10) : null
}

/** "******3210" — enough for a parent to recognise their number on screen. */
export function maskPhone(raw: string | null | undefined): string {
  const key = phoneKey(raw)
  return key ? `******${key.slice(-4)}` : ''
}
