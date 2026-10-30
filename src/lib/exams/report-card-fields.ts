/**
 * Every printed label on the report card that a school may hide or rename.
 * `toggle: false` entries can be renamed but are always shown (or are switched
 * by a template flag elsewhere, such as the rank and remarks options).
 */
export const REPORT_CARD_FIELDS = [
  { key: 'logo', group: 'Header', label: 'School logo', toggle: true, renamable: false },
  { key: 'schoolCode', group: 'Header', label: 'School code', toggle: true, renamable: true },
  { key: 'address', group: 'Header', label: 'Address', toggle: true, renamable: false },
  { key: 'contact', group: 'Header', label: 'Contact line', toggle: true, renamable: false },
  { key: 'session', group: 'Header', label: 'Session after title', toggle: true, renamable: false },
  { key: 'examName', group: 'Header', label: 'Exam name', toggle: true, renamable: false },

  { key: 'studentName', group: 'Student details', label: 'Student name', toggle: true, renamable: true },
  { key: 'admissionNo', group: 'Student details', label: 'Admission no.', toggle: true, renamable: true },
  { key: 'fatherName', group: 'Student details', label: "Father's name", toggle: true, renamable: true },
  { key: 'motherName', group: 'Student details', label: "Mother's name", toggle: true, renamable: true },
  { key: 'dateOfBirth', group: 'Student details', label: 'Date of birth', toggle: true, renamable: true },
  { key: 'classSection', group: 'Student details', label: 'Class & section', toggle: true, renamable: true },
  { key: 'rollNo', group: 'Student details', label: 'Roll no.', toggle: true, renamable: true },
  { key: 'bloodGroup', group: 'Student details', label: 'Blood group', toggle: true, renamable: true },
  { key: 'attendance', group: 'Student details', label: 'Attendance', toggle: false, renamable: true },

  { key: 'part1', group: 'Marks table', label: 'Part 1 · Scholastic achievement', toggle: false, renamable: true },
  { key: 'colCode', group: 'Marks table', label: 'Code', toggle: true, renamable: true },
  { key: 'colSubject', group: 'Marks table', label: 'Subject', toggle: false, renamable: true },
  { key: 'colMax', group: 'Marks table', label: 'Max', toggle: true, renamable: true },
  { key: 'colWritten', group: 'Marks table', label: 'Written', toggle: true, renamable: true },
  { key: 'colInternal', group: 'Marks table', label: 'Internal', toggle: true, renamable: true },
  { key: 'colOral', group: 'Marks table', label: 'Oral', toggle: true, renamable: true },
  { key: 'colObtained', group: 'Marks table', label: 'Total obtained', toggle: true, renamable: true },
  { key: 'colScaled', group: 'Marks table', label: 'Score (100)', toggle: true, renamable: true },
  { key: 'colGrade', group: 'Marks table', label: 'Grade', toggle: true, renamable: true },
  { key: 'colPoints', group: 'Marks table', label: 'GP', toggle: true, renamable: true },
  { key: 'colRemarks', group: 'Marks table', label: 'Qualitative remarks', toggle: false, renamable: true },

  { key: 'tileTotal', group: 'Summary', label: 'Grand total', toggle: true, renamable: true },
  { key: 'tilePercent', group: 'Summary', label: 'Percentage · CGPA', toggle: true, renamable: true },
  { key: 'tileGrade', group: 'Summary', label: 'Overall grade', toggle: true, renamable: true },
  { key: 'tileRank', group: 'Summary', label: 'Class standing', toggle: true, renamable: true },

  { key: 'part2', group: 'Holistic', label: 'Part 2 · Holistic development', toggle: false, renamable: true },
  { key: 'competencyHead', group: 'Holistic', label: '21st-century competency', toggle: false, renamable: true },
  { key: 'competencyScore', group: 'Holistic', label: 'Score / 5', toggle: false, renamable: true },
  { key: 'competencyMastery', group: 'Holistic', label: 'Mastery', toggle: true, renamable: true },
  { key: 'coScholasticHead', group: 'Holistic', label: 'Co-scholastic domain', toggle: false, renamable: true },
  { key: 'coScholasticGrade', group: 'Holistic', label: 'Grade', toggle: false, renamable: true },
  { key: 'coScholasticIndicator', group: 'Holistic', label: 'Indicator', toggle: true, renamable: true },

  { key: 'teacherRemark', group: 'Remarks & footer', label: "Class teacher's observation", toggle: true, renamable: true },
  { key: 'principalRemark', group: 'Remarks & footer', label: "Principal's remarks", toggle: true, renamable: true },
  { key: 'promotion', group: 'Remarks & footer', label: 'Promotion status', toggle: true, renamable: true },
  { key: 'resultBadge', group: 'Remarks & footer', label: 'Result', toggle: true, renamable: true },
  { key: 'signatures', group: 'Remarks & footer', label: 'Signatures', toggle: true, renamable: false },
  { key: 'issueDate', group: 'Remarks & footer', label: 'Date of issue', toggle: true, renamable: true },
  { key: 'footerNote', group: 'Remarks & footer', label: 'This is a computer-generated report card.', toggle: true, renamable: true },
] as const

export type ReportCardFieldKey = (typeof REPORT_CARD_FIELDS)[number]['key']
export type ReportCardFieldSetting = { show: boolean; label: string }
export type ReportCardFields = Record<ReportCardFieldKey, ReportCardFieldSetting>

export const REPORT_CARD_FIELD_GROUPS = [...new Set(REPORT_CARD_FIELDS.map((f) => f.group))]

export const DEFAULT_REPORT_CARD_FIELDS = Object.fromEntries(
  REPORT_CARD_FIELDS.map((f) => [f.key, { show: true, label: f.label }]),
) as ReportCardFields

export function parseReportCardFields(raw: unknown): ReportCardFields {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const out = {} as ReportCardFields
  for (const f of REPORT_CARD_FIELDS) {
    const v = (src[f.key] ?? {}) as Record<string, unknown>
    const label = typeof v.label === 'string' ? v.label.trim().slice(0, 80) : ''
    out[f.key] = {
      show: f.toggle && typeof v.show === 'boolean' ? v.show : true,
      label: f.renamable && label ? label : f.label,
    }
  }
  return out
}

/** Web-safe font stacks, so a printed card looks the same on any office PC. */
export const REPORT_CARD_FONTS = [
  { key: 'design', name: 'Design default', css: '' },
  { key: 'app', name: 'Golos (app font)', css: 'var(--font-golos), Arial, sans-serif' },
  { key: 'arial', name: 'Arial', css: 'Arial, Helvetica, sans-serif' },
  { key: 'verdana', name: 'Verdana', css: 'Verdana, Geneva, sans-serif' },
  { key: 'tahoma', name: 'Tahoma', css: 'Tahoma, Verdana, sans-serif' },
  { key: 'trebuchet', name: 'Trebuchet MS', css: '"Trebuchet MS", Arial, sans-serif' },
  { key: 'segoe', name: 'Segoe UI', css: '"Segoe UI", Roboto, Arial, sans-serif' },
  { key: 'georgia', name: 'Georgia', css: 'Georgia, "Times New Roman", serif' },
  { key: 'times', name: 'Times New Roman', css: '"Times New Roman", Times, serif' },
  { key: 'garamond', name: 'Garamond', css: 'Garamond, "EB Garamond", Georgia, serif' },
  { key: 'palatino', name: 'Palatino', css: '"Palatino Linotype", "Book Antiqua", Palatino, serif' },
  { key: 'courier', name: 'Courier New', css: '"Courier New", Courier, monospace' },
] as const

export type ReportCardFontKey = (typeof REPORT_CARD_FONTS)[number]['key']

export function reportCardFontCss(key: ReportCardFontKey) {
  return REPORT_CARD_FONTS.find((f) => f.key === key)?.css ?? ''
}
