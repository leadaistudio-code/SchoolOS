import type { AppContext } from '@/server/context'
import { ApiException } from '@/server/api/response'
import { toCsv } from '@/lib/csv'
import { toDateInput } from '@/lib/dates'
import { reportByKey, type ReportKey } from '@/lib/reports'
import { resolveRange, type ReportRange } from './range'
import { collectionReport } from './collection'
import { attendanceRollup } from './attendance'
import { academicReport } from './academic'
import { enrolmentReport } from './enrolment'
import { admissionsReport } from './admissions'
import { staffReport } from './staff'

export type ExportResult = { filename: string; csv: string }

/** Money leaves in major units with two decimals — a spreadsheet wants rupees. */
const major = (minor: number) => (minor / 100).toFixed(2)
const pct = (value: number | null) => (value === null ? '' : value)
const day = (value: Date | null | undefined) => (value ? toDateInput(value) : '')

/**
 * Renders one table of one report as CSV.
 *
 * The export runs the same query the page ran, from the same query string, so
 * a downloaded file and the screen it came from can never disagree. It is not
 * a second implementation of the report — it is the report, serialised.
 */
export async function exportReport(
  ctx: AppContext,
  query: Record<string, string | undefined>,
): Promise<ExportResult> {
  ctx.require('reports.export')

  const definition = reportByKey(query.report ?? '')
  if (!definition) throw new ApiException(400, 'BAD_REQUEST', 'Unknown report')

  const table = query.table ?? definition.exports[0]?.key
  if (!definition.exports.some((e) => e.key === table)) {
    throw new ApiException(400, 'BAD_REQUEST', 'Unknown table for this report')
  }

  const range = resolveRange(query, definition.defaultDays)
  const { headers, rows, suffix } = await build(ctx, definition.key, table!, range, query)

  return {
    filename: `${definition.key}-${table}-${suffix ?? range.fromInput}-to-${range.toInput}.csv`,
    csv: toCsv(headers, rows),
  }
}

type Table = {
  headers: string[]
  rows: Array<Array<string | number | null | undefined>>
  /** Replaces the range in the filename for reports that are not range-scoped. */
  suffix?: string
}

async function build(
  ctx: AppContext,
  report: ReportKey,
  table: string,
  range: ReportRange,
  query: Record<string, string | undefined>,
): Promise<Table> {
  switch (report) {
    case 'collection': {
      const data = await collectionReport(ctx, range)
      switch (table) {
        case 'class':
          return {
            headers: ['Class', 'Students billed', 'Billed', 'Collected', 'Outstanding', 'Realisation %'],
            rows: data.byClass.map((c) => [
              c.name,
              c.students,
              major(c.billedMinor),
              major(c.collectedMinor),
              major(c.outstandingMinor),
              pct(c.realisation),
            ]),
          }
        case 'head':
          return {
            headers: ['Fee head', 'Code', 'Lines', 'Billed net of concession'],
            rows: data.byHead.map((h) => [h.name, h.code, h.lines, major(h.billedMinor)]),
          }
        case 'mode':
          return {
            headers: ['Payment mode', 'Payments', 'Amount'],
            rows: data.byMode.map((m) => [m.mode, m.count, major(m.amountMinor)]),
          }
        case 'ageing':
          return {
            headers: ['Bucket', 'Invoices', 'Balance'],
            rows: data.ageing.map((a) => [a.bucket, a.invoices, major(a.amountMinor)]),
          }
        case 'defaulters':
          return {
            headers: ['Student', 'Admission no', 'Class', 'Invoices', 'Oldest due', 'Balance'],
            rows: data.defaulters.map((d) => [
              d.name,
              d.admissionNo,
              d.className,
              d.invoices,
              day(d.oldestDueOn),
              major(d.outstandingMinor),
            ]),
          }
        default:
          return {
            headers: ['Month', 'Billed', 'Collected', 'Payments'],
            rows: data.trend.map((t) => [
              t.month,
              major(t.billedMinor),
              major(t.collectedMinor),
              t.payments,
            ]),
          }
      }
    }

    case 'attendance': {
      const data = await attendanceRollup(ctx, range)
      switch (table) {
        case 'daily':
          return {
            headers: ['Date', 'Attended', 'Absent', 'Late', 'Marked', 'Attendance %'],
            rows: data.daily.map((d) => [d.day, d.present, d.absent, d.late, d.marked, pct(d.percent)]),
          }
        case 'chronic':
          return {
            headers: ['Student', 'Admission no', 'Class', 'Section', 'Attended', 'Absent', 'Marked', 'Attendance %'],
            rows: data.chronic.map((c) => [
              c.name,
              c.admissionNo,
              c.className,
              c.sectionName,
              c.present,
              c.absent,
              c.marked,
              c.percent,
            ]),
          }
        case 'unmarked':
          return {
            headers: ['Class', 'Section'],
            rows: data.unmarkedSections.map((s) => [s.className, s.name]),
          }
        default:
          return {
            headers: ['Class', 'Students', 'Attended', 'Absent', 'Late', 'Leave', 'Marked', 'Attendance %'],
            rows: data.byClass.map((c) => [
              c.name,
              c.students,
              c.present,
              c.absent,
              c.late,
              c.leave,
              c.marked,
              pct(c.percent),
            ]),
          }
      }
    }

    case 'academic': {
      const data = await academicReport(ctx, {
        examId: query.examId,
        classLevelId: query.classLevelId,
      })
      if (!data.exam) throw new ApiException(400, 'BAD_REQUEST', 'No exam has results to export')
      const suffix = data.exam.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()

      switch (table) {
        case 'subject':
          return {
            suffix,
            headers: ['Subject', 'Code', 'Class', 'Max marks', 'Appeared', 'Absent', 'Average', 'Highest', 'Pass rate %'],
            rows: data.bySubject.map((s) => [
              s.subject,
              s.code,
              s.className,
              s.maxMarks,
              s.appeared,
              s.absent,
              s.average ?? '',
              s.highest ?? '',
              pct(s.passRate),
            ]),
          }
        case 'grades':
          return {
            suffix,
            headers: ['Grade', 'Students'],
            rows: data.grades.map((g) => [g.grade, g.count]),
          }
        case 'toppers':
          return {
            suffix,
            headers: ['Student', 'Admission no', 'Class', 'Obtained', 'Out of', 'Percentage', 'Grade'],
            rows: data.toppers.map((r) => [
              r.name,
              r.admissionNo,
              r.className,
              r.totalObtained,
              r.totalMax,
              r.percentage,
              r.grade ?? '',
            ]),
          }
        case 'strugglers':
          return {
            suffix,
            headers: ['Student', 'Admission no', 'Class', 'Obtained', 'Out of', 'Percentage', 'Grade'],
            rows: data.strugglers.map((r) => [
              r.name,
              r.admissionNo,
              r.className,
              r.totalObtained,
              r.totalMax,
              r.percentage,
              r.grade ?? '',
            ]),
          }
        default:
          return {
            suffix,
            headers: ['Class', 'Students', 'Average %', 'Highest %', 'Passed', 'Pass rate %'],
            rows: data.byClass.map((c) => [
              c.name,
              c.students,
              c.average ?? '',
              c.highest ?? '',
              c.passed,
              pct(c.passRate),
            ]),
          }
      }
    }

    case 'enrolment': {
      const data = await enrolmentReport(ctx, range)
      switch (table) {
        case 'demographics':
          return {
            headers: ['Dimension', 'Value', 'Students'],
            rows: [
              ...data.byGender.map((g) => ['Gender', g.gender, g.count]),
              ...data.byCategory.map((c) => ['Category', c.category, c.count]),
              ...data.byStatus.map((s) => ['Status', s.status, s.count]),
            ],
          }
        case 'admissions':
          return {
            headers: ['Month', 'Admitted'],
            rows: data.admissionsTrend.map((t) => [t.month, t.count]),
          }
        default:
          return {
            headers: ['Class', 'Sections', 'Students', 'Boys', 'Girls', 'Capacity', 'Seats free', 'Utilisation %'],
            rows: data.byClass.map((c) => [
              c.name,
              c.sections,
              c.students,
              c.boys,
              c.girls,
              c.capacity,
              c.seatsFree,
              pct(c.utilisation),
            ]),
          }
      }
    }

    case 'admissions': {
      const data = await admissionsReport(ctx, range)
      switch (table) {
        case 'source':
          return {
            headers: ['Source', 'Enquiries', 'Enrolled', 'Lost', 'Conversion %'],
            rows: data.bySource.map((s) => [s.source, s.leads, s.enrolled, s.lost, pct(s.conversion)]),
          }
        case 'owner':
          return {
            headers: ['Owner', 'Enquiries', 'Enrolled', 'Conversion %'],
            rows: data.byOwner.map((o) => [o.name, o.leads, o.enrolled, pct(o.conversion)]),
          }
        case 'trend':
          return {
            headers: ['Month', 'Enquiries', 'Enrolled'],
            rows: data.trend.map((t) => [t.month, t.leads, t.enrolled]),
          }
        case 'lost':
          return {
            headers: ['Reason', 'Enquiries'],
            rows: data.lostReasons.map((r) => [r.reason, r.count]),
          }
        default:
          return {
            headers: ['Stage', 'Enquiries', 'Share %'],
            rows: data.funnel.map((s) => [s.stage, s.count, pct(s.share)]),
          }
      }
    }

    case 'staff': {
      const data = await staffReport(ctx, range)
      switch (table) {
        case 'leave':
          return {
            headers: ['Leave type', 'Requests', 'Approved', 'Rejected', 'Approved days'],
            rows: data.leaveByType.map((l) => [l.name, l.requests, l.approved, l.rejected, l.days]),
          }
        case 'department':
          return {
            headers: ['Department', 'Staff'],
            rows: data.byDepartment.map((d) => [d.department, d.count]),
          }
        default:
          return {
            headers: ['Member', 'Employee code', 'Type', 'Designation', 'Department', 'Present', 'Absent', 'Late', 'Half day', 'Leave', 'Marked', 'Attendance %'],
            rows: data.attendance.map((s) => [
              s.name,
              s.employeeCode,
              s.staffType,
              s.designation ?? '',
              s.department ?? '',
              s.present,
              s.absent,
              s.late,
              s.halfDay,
              s.leave,
              s.days,
              pct(s.percent),
            ]),
          }
      }
    }
  }
}
