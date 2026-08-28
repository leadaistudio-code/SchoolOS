/**
 * Normalise messy spreadsheet values before student import validation.
 */

function normalizeHeaderKey(key: string): string {
  return key.toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Read a cell when the mapped header or a known alias differs by capitalisation / wording. */
export function readMappedCell(
  raw: Record<string, string>,
  mappedHeader: string | null | undefined,
  ...aliases: string[]
): string {
  if (mappedHeader) {
    const direct = (raw[mappedHeader] ?? '').trim()
    if (direct) return direct
  }

  const wanted = new Set(aliases.map(normalizeHeaderKey))
  for (const [key, value] of Object.entries(raw)) {
    const n = normalizeHeaderKey(key)
    if (wanted.has(n)) return value.trim()
    for (const alias of wanted) {
      if (n.includes(alias) || alias.includes(n)) return value.trim()
    }
  }
  return ''
}

export function readImportDate(
  raw: Record<string, string>,
  mappedHeader: string | null | undefined,
  ...aliases: string[]
): Date | undefined {
  return parseImportDate(readMappedCell(raw, mappedHeader, ...aliases))
}

export function normalizeImportGender(value: string): 'MALE' | 'FEMALE' | 'OTHER' | undefined {
  if (!value) return undefined
  const v = value.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!v) return undefined

  if (['m', 'male', 'boy', 'b', '1', 'पुरुष', 'purush', 'ladka'].includes(v)) return 'MALE'
  if (['f', 'female', 'girl', 'g', '2', 'महिला', 'mahila', 'stri', 'ladki'].includes(v)) return 'FEMALE'
  if (
    ['o', 'other', 'others', 'non-binary', 'nb', 'trans', 'transgender', '3', 'na', 'n/a'].includes(v)
  ) {
    return 'OTHER'
  }

  if (v.includes('male') && !v.includes('female')) return 'MALE'
  if (v.includes('female') || v.includes('girl')) return 'FEMALE'
  return undefined
}

/** Parse dates from school spreadsheets — ISO, Indian DD/MM, Excel serials, etc. */
export function parseImportDate(value: string): Date | undefined {
  if (!value) return undefined
  let v = value.trim()
  if (!v) return undefined

  // Datetime strings — keep the calendar date only.
  const isoPrefix = v.match(/^(\d{4}-\d{2}-\d{2})/)
  if (isoPrefix) {
    const d = new Date(`${isoPrefix[1]}T00:00:00.000Z`)
    return Number.isNaN(d.getTime()) ? undefined : d
  }

  // DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
  const dmy = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)
  if (dmy) {
    const day = Number(dmy[1])
    const month = Number(dmy[2])
    const year = Number(dmy[3])
    if (month < 1 || month > 12 || day < 1 || day > 31) return undefined
    const d = new Date(Date.UTC(year, month - 1, day))
    if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
      return undefined
    }
    return d
  }

  // DD/MM/YY — common on school exports
  const dmy2 = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2})$/)
  if (dmy2) {
    const day = Number(dmy2[1])
    const month = Number(dmy2[2])
    let year = Number(dmy2[3])
    year += year >= 30 ? 1900 : 2000
    if (month < 1 || month > 12 || day < 1 || day > 31) return undefined
    const d = new Date(Date.UTC(year, month - 1, day))
    if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
      return undefined
    }
    return d
  }

  // Excel serial (e.g. 40179 from a date cell exported as a number)
  if (/^\d{4,5}(\.\d*)?$/.test(v)) {
    const serial = Math.floor(Number(v))
    if (serial >= 8_000 && serial <= 80_000) {
      const d = new Date(Date.UTC(1899, 11, 30 + serial))
      return Number.isNaN(d.getTime()) ? undefined : d
    }
  }

  const parsed = new Date(v)
  if (Number.isNaN(parsed.getTime())) return undefined
  return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()))
}

/**
 * Pull section out of a combined class cell ("Class 10 A", "10-A") when Section is blank.
 */
export function inferClassSection(
  className: string,
  sectionName: string,
): { className: string; sectionName: string } {
  const cls = className.trim()
  const sec = sectionName.trim()
  if (sec) return { className: cls, sectionName: sec }
  if (!cls) return { className: cls, sectionName: sec }

  const patterns = [
    /^(class\s+\d+)\s+([A-Za-z]+)$/i,
    /^(\d{1,2})\s+([A-Za-z])$/,
    /^(.+?)\s*-\s*([A-Za-z])$/,
    /^(.+?)\s+section\s+([A-Za-z]+)$/i,
  ]
  for (const pattern of patterns) {
    const m = cls.match(pattern)
    if (m?.[1] && m[2]) {
      return { className: m[1].trim(), sectionName: m[2].trim() }
    }
  }

  return { className: cls, sectionName: sec }
}
