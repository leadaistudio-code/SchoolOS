import ExcelJS from 'exceljs'
import { SECTION_STATUS_LABEL, type MarksRegister, type RegisterSheet } from './marks-register'

const NAVY = 'FF1E3A8A'
const ZEBRA = 'FFF1F5F9'
const BORDER = 'FFCBD5E1'
const RED = 'FFDC2626'
const AMBER = 'FFB45309'
const GREEN = 'FF15803D'
const MUTED = 'FF64748B'

const thin = { style: 'thin' as const, color: { argb: BORDER } }
const box = { top: thin, left: thin, bottom: thin, right: thin }

/** Excel's sheet-name rules: ≤31 chars, none of []:*?/\ and unique. */
function sheetName(base: string, used: Set<string>) {
  const clean = base.replace(/[[\]:*?/\\]/g, '-').slice(0, 31) || 'Sheet'
  let name = clean
  for (let i = 2; used.has(name.toLowerCase()); i++) name = `${clean.slice(0, 27)} (${i})`
  used.add(name.toLowerCase())
  return name
}

function letterhead(ws: ExcelJS.Worksheet, data: MarksRegister, subtitle: string, width: number) {
  const lines: Array<{ text: string; size: number; bold?: boolean; color?: string; fill?: string }> = [
    { text: data.school.name.toUpperCase(), size: 16, bold: true, color: NAVY },
    ...(data.school.address ? [{ text: data.school.address, size: 10, color: MUTED }] : []),
    ...(data.school.contact ? [{ text: data.school.contact, size: 10, color: MUTED }] : []),
    { text: `MARKS REGISTER · ${data.exam!.name} · ${data.exam!.session.name}`, size: 12, bold: true, color: 'FFFFFFFF', fill: NAVY },
    { text: subtitle, size: 11, bold: true },
  ]
  for (const line of lines) {
    const row = ws.addRow([line.text])
    ws.mergeCells(row.number, 1, row.number, width)
    const cell = row.getCell(1)
    cell.font = { size: line.size, bold: line.bold, color: line.color ? { argb: line.color } : undefined }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    if (line.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: line.fill } }
    row.height = line.size + 8
  }
  ws.addRow([])
}

function headerRow(ws: ExcelJS.Worksheet, values: string[]) {
  const row = ws.addRow(values)
  row.height = 30
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border = { top: { style: 'thin', color: { argb: NAVY } }, left: thin, bottom: { style: 'thin', color: { argb: NAVY } }, right: thin }
  })
  return row
}

function bodyRow(ws: ExcelJS.Worksheet, values: Array<string | number | null>, zebra: boolean) {
  const row = ws.addRow(values)
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.border = box
    cell.font = { size: 10 }
    cell.alignment = { vertical: 'middle', horizontal: typeof cell.value === 'number' ? 'center' : 'left' }
    if (zebra) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } }
  })
  return row
}

function signatures(ws: ExcelJS.Worksheet, width: number, generated: string, note?: string) {
  ws.addRow([])
  if (note) {
    const n = ws.addRow([note])
    ws.mergeCells(n.number, 1, n.number, width)
    n.getCell(1).font = { size: 9, italic: true, color: { argb: MUTED } }
  }
  ws.addRow([])
  ws.addRow([])
  const labels = ['Class Teacher', 'Examination In-charge', 'Principal']
  const row = ws.addRow([])
  const span = Math.max(1, Math.floor(width / 3))
  labels.forEach((label, i) => {
    const col = i * span + 1
    const cell = row.getCell(col)
    cell.value = label
    cell.font = { bold: true, size: 10 }
    cell.alignment = { horizontal: 'center' }
    cell.border = { top: { style: 'thin', color: { argb: 'FF334155' } } }
    if (span > 1) ws.mergeCells(row.number, col, row.number, Math.min(width, col + span - 1))
  })
  const g = ws.addRow([`Generated ${generated}`])
  g.getCell(1).font = { size: 8, color: { argb: MUTED } }
}

function registerSheet(wb: ExcelJS.Workbook, data: MarksRegister, reg: RegisterSheet, name: string, generated: string) {
  const showSection = !reg.sectionName
  const headers = [
    'Roll',
    'Adm. No',
    'Student name',
    ...(showSection ? ['Section'] : []),
    ...reg.subjects.map((s) => `${s.code || s.name}\n(${s.maxMarks})`),
    'Total',
    'Max',
    '%',
    'Grade',
    'Result',
    'Rank',
    'Status',
  ]
  const ws = wb.addWorksheet(name, {
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } },
    headerFooter: { oddFooter: `&L${data.school.name}&RPage &P of &N` },
  })
  letterhead(ws, data, `Class ${reg.className}${reg.sectionName ? ` · Section ${reg.sectionName}` : ' · All sections'} · ${reg.rows.length} students`, headers.length)
  const head = headerRow(ws, headers)
  ws.views = [{ state: 'frozen', xSplit: 3, ySplit: head.number }]
  ws.pageSetup.printTitlesRow = `${head.number}:${head.number}`

  const firstSubjectCol = showSection ? 5 : 4
  reg.rows.forEach((r, i) => {
    const subjectValues = reg.subjects.map((s) => {
      const c = r.cells[s.sheetId]
      if (!c || c.kind === 'na') return '—'
      if (c.kind === 'missing') return ''
      if (c.kind === 'absent') return 'AB'
      return c.value
    })
    const row = bodyRow(
      ws,
      [
        r.rollNumber,
        r.admissionNo,
        r.name,
        ...(showSection ? [r.sectionName] : []),
        ...subjectValues,
        r.entered ? r.obtained : null,
        r.entered ? r.max : null,
        r.percent,
        r.grade ?? '',
        r.result === 'PASS' ? 'Pass' : r.result === 'FAIL' ? 'Fail' : '',
        r.rank,
        r.complete ? 'Completed' : `${r.expected - r.entered} pending`,
      ],
      i % 2 === 1,
    )
    reg.subjects.forEach((s, j) => {
      const cell = row.getCell(firstSubjectCol + j)
      const c = r.cells[s.sheetId]
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      if (c?.kind === 'absent') cell.font = { size: 10, bold: true, color: { argb: AMBER } }
      if (c?.kind === 'mark' && c.fail) cell.font = { size: 10, bold: true, color: { argb: RED } }
      if (c?.kind === 'na') cell.font = { size: 10, color: { argb: 'FF94A3B8' } }
      if (c?.kind === 'missing') cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } }
    })
    const base = firstSubjectCol + reg.subjects.length
    row.getCell(base).font = { size: 10, bold: true }
    row.getCell(base + 2).numFmt = '0.0'
    row.getCell(base + 3).font = { size: 10, bold: true }
    row.getCell(base + 3).alignment = { horizontal: 'center' }
    const result = row.getCell(base + 4)
    result.alignment = { horizontal: 'center' }
    if (r.result) result.font = { size: 10, bold: true, color: { argb: r.result === 'PASS' ? GREEN : RED } }
    const status = row.getCell(base + 6)
    status.font = { size: 10, color: { argb: r.complete ? GREEN : AMBER } }
  })

  ws.columns.forEach((col, idx) => {
    const i = idx + 1
    col.width = i === 1 ? 6 : i === 2 ? 12 : i === 3 ? 26 : showSection && i === 4 ? 8 : i >= firstSubjectCol && i < firstSubjectCol + reg.subjects.length ? 9 : 10
  })
  signatures(ws, headers.length, generated, 'AB = absent · red = below pass mark · — = subject not taken by the section · grade, result and rank appear once every mark is in')
}

/** A styled workbook: summary sheet, then one sheet per class-section register. */
export async function marksRegisterWorkbook(data: MarksRegister) {
  const wb = new ExcelJS.Workbook()
  wb.creator = data.school.name
  wb.created = new Date()
  const generated = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })
  const used = new Set<string>()

  const headers = ['Class', 'Section', 'Students', 'Subjects', 'Marks entered', 'Expected', 'Entered %', 'All marks in', 'Locked papers', 'Pass', 'Fail', 'Class avg %', 'Status']
  const ws = wb.addWorksheet(sheetName('Summary', used), {
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })
  letterhead(ws, data, 'Class & section completion summary', headers.length)
  const head = headerRow(ws, headers)
  ws.views = [{ state: 'frozen', ySplit: head.number }]
  data.sections.forEach((s, i) => {
    const row = bodyRow(
      ws,
      [s.className, s.sectionName, s.students, s.subjects, s.entered, s.expected, s.percent / 100, s.completeStudents, `${s.sheetsLocked}/${s.subjects}`, s.passed, s.failed, s.average, SECTION_STATUS_LABEL[s.status]],
      i % 2 === 1,
    )
    row.getCell(7).numFmt = '0%'
    row.getCell(12).numFmt = '0.0'
    row.getCell(10).font = { size: 10, color: { argb: GREEN } }
    row.getCell(11).font = { size: 10, color: { argb: s.failed ? RED : MUTED } }
    row.getCell(13).font = { size: 10, bold: true, color: { argb: s.status === 'COMPLETED' ? GREEN : s.status === 'IN_PROGRESS' ? AMBER : MUTED } }
  })
  const total = ws.addRow([
    'Total',
    '',
    data.totals.students,
    '',
    '',
    '',
    '',
    data.totals.completeStudents,
    '',
    '',
    '',
    '',
    `${data.totals.completed}/${data.totals.sections} complete`,
  ])
  total.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { bold: true, size: 10 }
    cell.border = { top: { style: 'medium', color: { argb: NAVY } }, bottom: { style: 'medium', color: { argb: NAVY } } }
  })
  ws.columns.forEach((col, i) => (col.width = i < 2 ? 14 : i === 12 ? 18 : 12))
  signatures(ws, headers.length, generated)

  for (const reg of data.sectionRegisters) {
    if (!reg.rows.length) continue
    registerSheet(wb, data, reg, sheetName(`${reg.className}${reg.sectionName ? ` ${reg.sectionName}` : ''}`, used), generated)
  }

  return Buffer.from(await wb.xlsx.writeBuffer())
}
