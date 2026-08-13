import * as XLSX from 'xlsx'
import { parseCsv, type CsvTable } from '@/lib/csv'

export type SpreadsheetGrid = {
  /** Every cell as a string, including title rows above the header. */
  grid: string[][]
  fileKind: 'csv' | 'xlsx'
  sheetNames?: string[]
  sheetName?: string
}

/** Normalise any spreadsheet upload into a raw 2D string grid. */
export function parseSpreadsheet(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
): SpreadsheetGrid {
  const lower = fileName.toLowerCase()
  const isExcel =
    lower.endsWith('.xlsx') ||
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

  if (isExcel) {
    return excelToGrid(buffer)
  }

  const text = buffer.toString('utf8')
  const table = parseCsv(text)
  const grid: string[][] = [table.headers, ...table.rows.map((row) => table.headers.map((h) => row[h] ?? ''))]
  return { grid, fileKind: 'csv' }
}

function excelToGrid(buffer: Buffer): SpreadsheetGrid {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, raw: false })
  const sheetNames = workbook.SheetNames
  const sheetName = pickSheetName(sheetNames)
  if (!sheetName) return { grid: [], fileKind: 'xlsx', sheetNames, sheetName }

  const sheet = workbook.Sheets[sheetName]!
  const rows = XLSX.utils.sheet_to_json<(string | number | boolean | Date | null)[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
  })

  return {
    grid: rows.map((row) => row.map((cell) => formatCell(cell))),
    fileKind: 'xlsx',
    sheetNames,
    sheetName,
  }
}

function pickSheetName(sheetNames: string[]): string | undefined {
  const preferred = ['Students', 'Student', 'students']
  for (const alias of preferred) {
    const hit = sheetNames.find((n) => n.toLowerCase() === alias.toLowerCase())
    if (hit) return hit
  }
  const skip = new Set(['read me', 'allowed values', 'instructions'])
  return sheetNames.find((n) => !skip.has(n.toLowerCase())) ?? sheetNames[0]
}

function formatCell(value: string | number | boolean | Date | null | undefined): string {
  if (value == null || value === '') return ''
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return ''
    return value.toISOString().slice(0, 10)
  }
  return String(value).trim()
}

/**
 * Turn a grid + header row index into the header/row objects the importer expects.
 */
export function gridToTable(grid: string[][], headerRowIndex: number): CsvTable {
  if (headerRowIndex < 0 || headerRowIndex >= grid.length) {
    throw new Error('The header row is outside the file')
  }

  const headerRow = grid[headerRowIndex] ?? []
  const headers = headerRow.map((h, i) => {
    const cleaned = h.trim()
    return cleaned || `Column ${i + 1}`
  })

  const seen = new Map<string, number>()
  const uniqueHeaders = headers.map((h) => {
    const count = seen.get(h) ?? 0
    seen.set(h, count + 1)
    return count === 0 ? h : `${h} (${count + 1})`
  })

  const rows: Record<string, string>[] = []
  for (let r = headerRowIndex + 1; r < grid.length; r++) {
    const cells = grid[r] ?? []
    if (cells.every((c) => !String(c).trim())) continue
    const row: Record<string, string> = {}
    for (let c = 0; c < uniqueHeaders.length; c++) {
      row[uniqueHeaders[c]!] = formatCell(cells[c])
    }
    rows.push(row)
  }

  return { headers: uniqueHeaders, rows }
}

/** Compact preview for the model — trim width and blank trailing columns. */
export function gridPreview(grid: string[][], maxRows = 28, maxCols = 24): string[][] {
  const trimmed = grid.slice(0, maxRows).map((row) => row.slice(0, maxCols).map((c) => c.trim()))
  let lastCol = 0
  for (const row of trimmed) {
    for (let c = row.length - 1; c >= lastCol; c--) {
      if (row[c]) {
        lastCol = Math.max(lastCol, c + 1)
        break
      }
    }
  }
  return trimmed.map((row) => row.slice(0, lastCol || 1))
}

export function gridPreviewText(grid: string[][]): string {
  return gridPreview(grid)
    .map((row, i) => `${String(i).padStart(2, ' ')} | ${row.join(' | ')}`)
    .join('\n')
}
