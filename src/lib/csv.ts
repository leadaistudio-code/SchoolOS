/**
 * Minimal CSV parser.
 *
 * Handles quoted fields, escaped quotes (""), CRLF/LF, and a leading UTF-8 BOM.
 * Deliberately dependency-free so imports stay auditable and easy to test.
 */

export type CsvTable = {
  headers: string[]
  rows: Record<string, string>[]
}

export function parseCsv(text: string): CsvTable {
  const raw = text.replace(/^\uFEFF/, '')
  if (!raw.trim()) {
    throw new Error('The file is empty')
  }

  const matrix = parseMatrix(raw)
  if (matrix.length === 0) throw new Error('The file is empty')

  const headers = matrix[0]!.map((h, i) => {
    const cleaned = h.trim()
    return cleaned || `Column ${i + 1}`
  })

  // Duplicate headers make mapping ambiguous — rename later ones.
  const seen = new Map<string, number>()
  const uniqueHeaders = headers.map((h) => {
    const count = seen.get(h) ?? 0
    seen.set(h, count + 1)
    return count === 0 ? h : `${h} (${count + 1})`
  })

  const rows: Record<string, string>[] = []
  for (let i = 1; i < matrix.length; i++) {
    const cells = matrix[i]!
    if (cells.every((c) => c.trim() === '')) continue
    const row: Record<string, string> = {}
    for (let c = 0; c < uniqueHeaders.length; c++) {
      row[uniqueHeaders[c]!] = (cells[c] ?? '').trim()
    }
    rows.push(row)
  }

  return { headers: uniqueHeaders, rows }
}

function parseMatrix(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    const next = text[i + 1]

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        field += ch
      }
      continue
    }

    if (ch === '"') {
      inQuotes = true
      continue
    }
    if (ch === ',') {
      row.push(field)
      field = ''
      continue
    }
    if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      continue
    }
    if (ch === '\r') {
      continue
    }
    field += ch
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows
}

/** Build a downloadable CSV string from headers + rows. */
export function toCsv(headers: string[], rows: Array<Array<string | number | null | undefined>>): string {
  const escape = (value: string | number | null | undefined) => {
    const s = value == null ? '' : String(value)
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  return [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n')
}
