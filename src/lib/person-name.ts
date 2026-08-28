/** Split a full name into first and last parts for storage. One-word names stay whole. */
export function splitPersonName(full: string): { firstName: string; lastName: string } {
  const trimmed = full.trim()
  if (!trimmed) return { firstName: '', lastName: '' }
  const parts = trimmed.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return { firstName: parts[0]!, lastName: parts.slice(1).join(' ') }
  }
  return { firstName: parts[0]!, lastName: '' }
}
