/**
 * Fits a free-form notification into the WhatsApp notification template:
 *
 *   School update: *{{1}}*
 *
 *   {{2}}
 *
 *   This is an automated message from your school, sent via MyCampusView.
 *
 * Meta rejects a parameter holding a line break, a tab or more than four
 * spaces in a row, and a message whose filled-in body exceeds 1024
 * characters - the limits below leave room for the template's own text.
 */

export const NOTIFY_TITLE_MAX = 80
export const NOTIFY_DETAIL_MAX = 800

const FALLBACK_TITLE = 'Notification'

/** One line, single-spaced, never empty, at most `max` characters. */
export function templateParam(text: string, max: number): string {
  const flat = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' · ')
  if (!flat) return '-'
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`
}

/**
 * Heading and details. Callers write "title\n\nbody" or "School name: text";
 * anything else becomes a generic heading over the whole text.
 */
export function notificationTemplateVariables(body: string): { '1': string; '2': string } {
  const text = body.trim()
  const blank = text.search(/\r?\n\s*\r?\n/)
  if (blank > 0) {
    return {
      '1': templateParam(text.slice(0, blank), NOTIFY_TITLE_MAX),
      '2': templateParam(text.slice(blank), NOTIFY_DETAIL_MAX),
    }
  }
  const colon = text.indexOf(': ')
  if (colon > 0 && colon <= NOTIFY_TITLE_MAX && !text.slice(0, colon).includes('\n')) {
    return {
      '1': templateParam(text.slice(0, colon), NOTIFY_TITLE_MAX),
      '2': templateParam(text.slice(colon + 2), NOTIFY_DETAIL_MAX),
    }
  }
  return { '1': FALLBACK_TITLE, '2': templateParam(text, NOTIFY_DETAIL_MAX) }
}
