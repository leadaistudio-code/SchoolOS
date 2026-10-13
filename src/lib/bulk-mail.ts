/**
 * Bulk email — shared by the console UI and the server.
 *
 * A campaign is one message sent separately to every school on a list, so no
 * recipient ever sees another's address. The list usually arrives as a CSV.
 */

export const MAX_CAMPAIGN_RECIPIENTS = 1000
export const BATCH_SIZES = [10, 20, 25, 50] as const
export const DEFAULT_BATCH_SIZE = 10
/** Pause between two messages in a batch; bursts are what spam filters notice. */
export const SEND_GAP_MS = 1500

export const BULK_VARS = ['contactName', 'schoolName', 'area', 'senderName', 'senderTitle'] as const
export type BulkVar = (typeof BULK_VARS)[number]
export type BulkVars = Partial<Record<BulkVar, string | null>>

export const BULK_VAR_HINT =
  '{{schoolName}}, {{contactName}} and {{area}} come from each row of the list; {{senderName}} and {{senderTitle}} from your signature.'

export type BulkRecipient = {
  email: string
  schoolName: string | null
  contactName: string | null
  area: string | null
}

export const CAMPAIGN_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Ready to send',
  SENDING: 'Sending',
  PAUSED: 'Paused',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
}

/** Fills each known variable; a missing value falls back to a neutral phrase. */
export function fillBulkTemplate(text: string, vars: BulkVars, escape: (v: string) => string = (v) => v): string {
  const fallback: Record<BulkVar, string> = {
    contactName: 'Sir / Madam',
    schoolName: 'your school',
    area: 'your area',
    senderName: '',
    senderTitle: '',
  }
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => {
    if (!(BULK_VARS as readonly string[]).includes(key)) return match
    const value = vars[key as BulkVar]?.trim() || fallback[key as BulkVar]
    return escape(value)
  })
}

/** Placeholders that no row or signature can fill. */
export function unknownBulkPlaceholders(text: string): string[] {
  const found = Array.from(text.matchAll(/\{\{\s*(\w+)\s*\}\}/g), (m) => m[1]!)
  return Array.from(new Set(found.filter((k) => !(BULK_VARS as readonly string[]).includes(k))))
}

/* --------------------------------------------------------------------- csv */

/** RFC 4180: quoted fields, doubled quotes, commas and newlines inside quotes. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, '')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += ch
    }
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ''))
}

export type ColumnMap = {
  email: number
  altEmail: number
  schoolName: number
  contactName: number
  area: number
}

const EMAIL_IN_TEXT = /[^\s@<>(),;:"[\]]+@[^\s@<>(),;:"[\]]+\.[a-z]{2,}/i

function findHeader(headers: string[], test: RegExp, exclude?: RegExp, taken: number[] = []): number {
  return headers.findIndex((h, i) => !taken.includes(i) && test.test(h) && !(exclude && exclude.test(h)))
}

/** Guesses which column holds what, from the header names and, failing that, the values. */
export function detectColumns(headers: string[], sample: string[][]): ColumnMap {
  const h = headers.map((x) => x.toLowerCase().trim())
  const alt = /alt|alternate|secondary|other|second|2/
  let email = findHeader(h, /e-?mail/, alt)
  if (email < 0) email = findHeader(h, /e-?mail/)
  if (email < 0) {
    email = headers.findIndex((_, i) => sample.some((r) => EMAIL_IN_TEXT.test(r[i] ?? '')))
  }
  const altEmail = findHeader(h, /e-?mail/, undefined, [email])
  let schoolName = findHeader(h, /school|institution|organi[sz]ation|college|academy/, /e-?mail|id$/)
  if (schoolName < 0) schoolName = findHeader(h, /^(name|account|company)$/)
  const contactName = findHeader(h, /contact|principal|person|director|addressee|recipient|^name$/, /e-?mail|phone|mobile|number|no\.?$/, [
    schoolName,
  ])
  const area = findHeader(h, /area|locality|location|city|town|zone|region|district/, /pin|code/)
  return { email, altEmail, schoolName, contactName, area }
}

const EMAIL_RE = /^[^\s@<>(),;:"[\]]+@[^\s@<>(),;:"[\]]+\.[^\s@<>(),;:"[\]]{2,}$/

export function isEmail(value: string): boolean {
  return EMAIL_RE.test(value)
}

/** A cell may hold "a@x.com; b@y.com" — the first valid address wins. */
export function firstEmail(cell: string | undefined): string | null {
  if (!cell) return null
  for (const part of cell.split(/[,;/\s]+/)) {
    const clean = part.replace(/^mailto:/i, '').replace(/[<>]/g, '').trim().toLowerCase()
    if (isEmail(clean)) return clean
  }
  return null
}

export type ParsedRow = BulkRecipient & { row: number; problem: string | null }

/** Turns CSV rows into recipients; flags rows without a usable address and repeats. */
export function rowsToRecipients(rows: string[][], map: ColumnMap): ParsedRow[] {
  const seen = new Set<string>()
  const cell = (r: string[], i: number) => (i >= 0 ? r[i]?.trim() || null : null)
  return rows.map((r, idx) => {
    const email = firstEmail(cell(r, map.email) ?? undefined) ?? firstEmail(cell(r, map.altEmail) ?? undefined)
    let problem: string | null = null
    if (!email) problem = cell(r, map.email) ? 'Invalid email' : 'No email'
    else if (seen.has(email)) problem = 'Duplicate'
    if (email) seen.add(email)
    return {
      row: idx + 2,
      email: email ?? (cell(r, map.email) || ''),
      schoolName: cell(r, map.schoolName),
      contactName: cell(r, map.contactName),
      area: cell(r, map.area),
      problem,
    }
  })
}
