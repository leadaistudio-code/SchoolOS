import { z } from 'zod'
import type { AppContext } from '@/server/context'
import { toSafeCsv } from '@/lib/csv'
import { schoolToday } from '@/lib/periods'
import { getViewSession } from '@/server/view-session'
import { notFound } from '@/server/api/response'
import {
  FEE_STATUS_LABEL,
  studentFeePayersReport,
  studentFeeReportSchema,
  studentFeeStatusReport,
} from './student-fee-report'

export const studentFeeReportExportSchema = studentFeeReportSchema.extend({
  format: z.enum(['csv', 'pdf']).default('csv'),
})

type ExportFile = { filename: string; contentType: string; body: string }

const rupees = (minor: number) => (minor / 100).toFixed(2)

export function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

const dateIso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '')

export function printablePage(title: string, meta: string, summary: [string, string][], headers: string[], numeric: Set<number>, rows: string[][]) {
  const head = headers.map((h, i) => `<th${numeric.has(i) ? ' class="num"' : ''}>${escapeHtml(h)}</th>`).join('')
  const body = rows
    .map((r) => `<tr>${r.map((c, i) => `<td${numeric.has(i) ? ' class="num"' : ''}>${escapeHtml(c)}</td>`).join('')}</tr>`)
    .join('\n')
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light; }
    body { font-family: "Segoe UI", system-ui, sans-serif; color: #111827; margin: 24px; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    .meta { color: #4b5563; font-size: 12px; margin-bottom: 16px; }
    .summary { display: flex; flex-wrap: wrap; gap: 24px; margin-bottom: 16px; font-size: 13px; }
    .summary strong { display: block; font-size: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #d1d5db; padding: 6px 8px; text-align: left; }
    th { background: #f3f4f6; font-weight: 600; }
    td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
    .actions { margin-bottom: 16px; }
    button { padding: 8px 14px; border: 1px solid #9ca3af; border-radius: 6px; background: #111827; color: #fff; cursor: pointer; }
    @media print {
      .actions { display: none; }
      body { margin: 8mm; }
      th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="actions"><button type="button" onclick="window.print()">Print / Save as PDF</button></div>
  <h1>${escapeHtml(title)}</h1>
  <p class="meta">${escapeHtml(meta)}</p>
  <div class="summary">${summary.map(([k, v]) => `<div><span>${escapeHtml(k)}</span><strong>${escapeHtml(v)}</strong></div>`).join('')}</div>
  <table>
    <thead><tr>${head}</tr></thead>
    <tbody>
${body}
    </tbody>
  </table>
</body>
</html>`
}

export async function exportStudentFeeReport(ctx: AppContext, query: z.infer<typeof studentFeeReportExportSchema>): Promise<ExportFile> {
  const session = await getViewSession(ctx)
  if (!session) throw notFound('Academic session')
  const school = ctx.tenant.school?.name ?? ctx.tenant.name
  const stamp = schoolToday()
  const slug = session.name.replace(/[^\w-]+/g, '-')

  if (query.view === 'payers') {
    const report = await studentFeePayersReport(ctx, session, query)
    const headers = ['Student name', 'Admission no.', 'Class', 'Section', 'Payments', 'Amount paid', 'Last paid on']
    const matrix = report.rows.map((r) => [
      r.name, r.admissionNo, r.className, r.sectionName, String(r.payments), rupees(r.amountMinor), dateIso(r.lastPaidAt),
    ])
    const base = `fee-payers-${report.period.from ?? 'start'}-to-${report.period.to ?? stamp}`
    if (query.format === 'csv') {
      return { filename: `${base}.csv`, contentType: 'text/csv; charset=utf-8', body: `\uFEFF${toSafeCsv(headers, matrix)}\r\n` }
    }
    return {
      filename: `${base}.html`,
      contentType: 'text/html; charset=utf-8',
      body: printablePage(
        `${school} — Students who paid fees`,
        `${report.period.from ?? '…'} to ${report.period.to ?? '…'} · Session ${session.name} · Generated ${stamp}`,
        [
          ['Students who paid', String(report.students)],
          ['Payments', String(report.payments)],
          ['Amount collected', rupees(report.amountMinor)],
          ['Average per student', rupees(report.averageMinor)],
        ],
        headers,
        new Set([4, 5]),
        matrix,
      ),
    }
  }

  const report = await studentFeeStatusReport(ctx, session, query)
  const headers = ['Student name', 'Admission no.', 'Class', 'Section', 'Roll no.', 'Parent phone', 'Status', 'Billed', 'Paid', 'Balance']
  const matrix = report.rows.map((r) => [
    r.name, r.admissionNo, r.className, r.sectionName, r.rollNumber ?? '', r.parentPhone ?? '',
    FEE_STATUS_LABEL[r.status], rupees(r.billedMinor), rupees(r.paidMinor), rupees(r.balanceMinor),
  ])
  const statusPart = query.status === 'all' ? 'all' : query.status
  const base = `fee-status-${slug}-${statusPart}`
  if (query.format === 'csv') {
    return { filename: `${base}.csv`, contentType: 'text/csv; charset=utf-8', body: `\uFEFF${toSafeCsv(headers, matrix)}\r\n` }
  }
  return {
    filename: `${base}.html`,
    contentType: 'text/html; charset=utf-8',
    body: printablePage(
      `${school} — Fee status, session ${session.name}`,
      `${query.status === 'all' ? 'All students' : FEE_STATUS_LABEL[query.status]} · ${report.rows.length} listed · Generated ${stamp}`,
      [
        ['Students', String(report.totalStudents)],
        ['Fully paid', String(report.counts.paid)],
        ['Partly paid', String(report.counts.partial)],
        ['Not paid', String(report.counts.unpaid)],
        ['Billed', rupees(report.billedMinor)],
        ['Collected', rupees(report.paidMinor)],
        ['Outstanding', rupees(report.balanceMinor)],
      ],
      headers,
      new Set([7, 8, 9]),
      matrix,
    ),
  }
}
