import ExcelJS from 'exceljs'

/** Build a simple .xlsx buffer from sheet name + rows (first row usually headers). */
export async function workbookFromAoA(
  sheets: Array<{ name: string; rows: Array<Array<string | number | boolean | Date | null | undefined>>; columnWidths?: number[] }>,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  for (const sheet of sheets) {
    const ws = workbook.addWorksheet(sheet.name.slice(0, 31))
    for (const row of sheet.rows) {
      ws.addRow(row.map((cell) => (cell == null ? '' : cell)))
    }
    if (sheet.columnWidths?.length) {
      sheet.columnWidths.forEach((width, index) => {
        ws.getColumn(index + 1).width = width
      })
    }
  }
  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer as ArrayBuffer)
}

/** Read every sheet of an .xlsx into string grids (row-major). */
export async function gridsFromXlsx(buffer: Buffer): Promise<{ sheetNames: string[]; sheets: Record<string, string[][]> }> {
  const workbook = new ExcelJS.Workbook()
  // ExcelJS typings target an older Node Buffer shape than Node 24 / @types/node.
  await workbook.xlsx.load(Uint8Array.from(buffer))

  const sheetNames: string[] = []
  const sheets: Record<string, string[][]> = {}

  workbook.eachSheet((worksheet) => {
    const name = worksheet.name
    sheetNames.push(name)
    const grid: string[][] = []
    const columnCount = Math.max(worksheet.columnCount, 1)

    worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      while (grid.length < rowNumber) grid.push(Array.from({ length: columnCount }, () => ''))
      const values = row.values
      const line = Array.from({ length: columnCount }, (_, i) => formatExcelCell(values[i + 1]))
      grid[rowNumber - 1] = line
    })

    sheets[name] = grid
  })

  return { sheetNames, sheets }
}

function formatExcelCell(value: ExcelJS.CellValue): string {
  if (value == null || value === '') return ''
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return ''
    return value.toISOString().slice(0, 10)
  }
  if (typeof value === 'object') {
    if ('text' in value && typeof value.text === 'string') return value.text.trim()
    if ('result' in value && value.result != null) return formatExcelCell(value.result as ExcelJS.CellValue)
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join('').trim()
    }
    if ('hyperlink' in value && 'text' in value) return String((value as { text?: string }).text ?? '').trim()
  }
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  return String(value).trim()
}
