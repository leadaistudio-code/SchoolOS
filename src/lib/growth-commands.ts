/**
 * Replies a salesperson can send to the business WhatsApp number. Numbers
 * refer to the last list the bot sent them.
 */
export type SalesCommand =
  | { kind: 'list' }
  | { kind: 'help' }
  | { kind: 'done'; items: number[] }
  | { kind: 'snooze'; items: number[]; days: number }
  | { kind: 'book'; item: number; days: number }
  | { kind: 'note'; item: number; text: string }
  | { kind: 'unknown' }

const NUMS = String.raw`(\d{1,2}(?:\s*[, ]\s*\d{1,2})*)`

function nums(raw: string): number[] {
  return [...new Set(raw.split(/[\s,]+/).filter(Boolean).map(Number))].filter((n) => n >= 1)
}

export function parseSalesCommand(input: string): SalesCommand {
  const text = input.trim().replace(/\s+/g, ' ')
  const t = text.toLowerCase().replace(/[.!]+$/, '')

  if (/^(list|my list|show my list|show list|show|today|pending|hi|hello|hey|menu|start)$/.test(t)) return { kind: 'list' }
  if (/^(help|\?|commands)$/.test(t)) return { kind: 'help' }

  let m = new RegExp(`^(?:done|did|complete|completed|ok)\\s+${NUMS}$`).exec(t)
  if (m) return { kind: 'done', items: nums(m[1]!) }

  m = new RegExp(`^(?:tomorrow|tmrw|tmr|kal)\\s+${NUMS}$`).exec(t)
  if (m) return { kind: 'snooze', items: nums(m[1]!), days: 1 }

  m = new RegExp(`^(?:week|next week|nextweek)\\s+${NUMS}$`).exec(t)
  if (m) return { kind: 'snooze', items: nums(m[1]!), days: 7 }

  // "snooze 2" (1 day), "snooze 2 3" / "snooze 2 3d" / "snooze 2,4 3 days"
  m = /^snooze\s+(\d{1,2}(?:\s*,\s*\d{1,2})*)(?:\s+(\d{1,2})\s*(?:d|day|days)?)?$/.exec(t)
  if (m) return { kind: 'snooze', items: nums(m[1]!), days: clampDays(m[2] ? Number(m[2]) : 1) }

  // "book 2 3" → new follow-up for item 2's school in 3 days (default 2)
  m = /^(?:book|again|next)\s+(\d{1,2})(?:\s+(\d{1,2})\s*(?:d|day|days)?)?$/.exec(t)
  if (m) return { kind: 'book', item: Number(m[1]), days: clampDays(m[2] ? Number(m[2]) : 2) }

  m = /^note\s+(\d{1,2})\s+(.+)$/i.exec(text)
  if (m) return { kind: 'note', item: Number(m[1]), text: m[2]!.trim() }

  return { kind: 'unknown' }
}

function clampDays(days: number) {
  return Math.min(60, Math.max(1, days))
}

export const SALES_HELP = [
  '*Reply with:*',
  '• *list* - your follow-ups',
  '• *done 1* - mark 1 done (or *done 1 3*)',
  '• *tomorrow 2* - move 2 to tomorrow',
  '• *week 2* - move 2 to next week',
  '• *snooze 2 3* - move 2 by 3 days',
  '• *book 1 3* - new call for 1 in 3 days',
  '• *note 1 asked for revised quote*',
].join('\n')
