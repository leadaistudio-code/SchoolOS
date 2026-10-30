import {
  DEFAULT_REPORT_CARD_CONFIG,
  type HolisticData,
  type ReportCardConfig,
} from './report-card-config'

export type ReportCardSubjectRow = {
  code: string
  name: string
  maxMarks: number
  marksObtained: number | null
  /** Written / internal / oral split; null when the paper has no parts. */
  parts: {
    written: number | null
    writtenMax: number
    internal: number | null
    internalMax: number | null
    oral: number | null
    oralMax: number | null
  } | null
  isAbsent: boolean
  /** Marks scaled to 100 so papers with different maxima read alike. */
  scaled: number | null
  grade: string | null
  points: number | null
  remarks: string | null
  isPass: boolean
}

export type ReportCardDocumentData = {
  school: {
    name: string
    code: string
    logoUrl: string | null
    address: string
    contact: string
    signatureUrl: string | null
  }
  sessionName: string
  examName: string
  issuedOn: string
  draft: boolean
  student: {
    name: string
    admissionNo: string
    fatherName: string
    motherName: string
    dateOfBirth: string
    className: string
    sectionName: string
    rollNumber: string
    bloodGroup: string
    photoUrl: string | null
  }
  attendance: { present: number; total: number; percent: number } | null
  subjects: ReportCardSubjectRow[]
  totals: {
    obtained: number
    max: number
    percentage: number
    grade: string | null
    cgpa: number | null
    rank: number | null
    classStrength: number
    isPass: boolean
  }
  holistic: HolisticData
  teacherRemark: string | null
  principalRemark: string | null
  promotionStatus: string | null
  options: { showAttendance: boolean; showRank: boolean; showRemarks: boolean }
  config: ReportCardConfig
}

/** Average grade point across graded subjects, to one decimal. */
export function computeCgpa(subjects: Pick<ReportCardSubjectRow, 'points'>[]) {
  const points = subjects.map((s) => s.points).filter((p): p is number => typeof p === 'number')
  if (points.length === 0) return null
  return Math.round((points.reduce((a, b) => a + b, 0) / points.length) * 10) / 10
}

/** Fictional student used by the template preview; never real data. */
export function sampleReportCard(
  school: { name: string; code: string; logoUrl: string | null; signatureUrl: string | null; address?: string; contact?: string },
  config: ReportCardConfig = DEFAULT_REPORT_CARD_CONFIG,
): ReportCardDocumentData {
  const rows: Array<[string, string, number, string, number, string]> = [
    ['184', 'English Language & Literature', 92, 'A+', 10, 'Excellent articulation and reading comprehension'],
    ['002', 'Hindi Course-A', 85, 'A', 9, 'Good command over grammar and literature'],
    ['041', 'Mathematics (Standard)', 96, 'A+', 10, 'Outstanding analytical and problem-solving skills'],
    ['086', 'Science', 89, 'A', 9, 'Very good conceptual clarity and practical work'],
    ['087', 'Social Science', 78, 'B+', 8, 'Consistent effort; can improve map work'],
    ['402', 'Information Technology', 94, 'A+', 10, 'Excellent practical and coding skills'],
  ]
  const subjects: ReportCardSubjectRow[] = rows.map(([code, name, marks, grade, points, remarks]) => {
    const oral = Math.min(20, Math.round(marks / 5))
    return {
      code, name, maxMarks: 100, marksObtained: marks, isAbsent: false, scaled: marks, grade, points, remarks, isPass: true,
      parts: { written: marks - oral, writtenMax: 80, internal: null, internalMax: null, oral, oralMax: 20 },
    }
  })
  const obtained = subjects.reduce((sum, s) => sum + (s.marksObtained ?? 0), 0)
  const competencies = Object.fromEntries(
    config.competencies.map((name, i) => [name, { score: [5, 4, 5, 4, 4, 5, 3][i % 7]!, note: null }]),
  )
  const coScholastic = Object.fromEntries(
    config.coScholastic.map((name, i) => [name, { grade: ['A+', 'A', 'A+', 'A', 'B'][i % 5]!, note: null }]),
  )
  return {
    school: {
      name: school.name,
      code: school.code,
      logoUrl: school.logoUrl,
      address: school.address ?? '',
      contact: school.contact ?? '',
      signatureUrl: school.signatureUrl,
    },
    sessionName: '2025-2026',
    examName: 'Annual Examination',
    issuedOn: new Date().toISOString().slice(0, 10),
    draft: false,
    student: {
      name: 'Aarav Sharma',
      admissionNo: 'ADM-2025-0142',
      fatherName: 'Rajesh Sharma',
      motherName: 'Priya Sharma',
      dateOfBirth: '2011-08-14',
      className: 'Class 9',
      sectionName: 'A',
      rollNumber: '12',
      bloodGroup: 'B+',
      photoUrl: null,
    },
    attendance: { present: 218, total: 230, percent: 94.8 },
    subjects,
    totals: {
      obtained,
      max: subjects.length * 100,
      percentage: Math.round((obtained / (subjects.length * 100)) * 10000) / 100,
      grade: 'A',
      cgpa: computeCgpa(subjects),
      rank: 3,
      classStrength: 42,
      isPass: true,
    },
    holistic: { competencies, coScholastic },
    teacherRemark: 'Aarav is a curious, disciplined learner who participates actively in class and helps peers. He should keep reading widely to strengthen his written expression.',
    principalRemark: 'A commendable performance. Keep up the excellent work.',
    promotionStatus: 'Promoted to Class 10',
    options: { showAttendance: true, showRank: true, showRemarks: true },
    config,
  }
}
