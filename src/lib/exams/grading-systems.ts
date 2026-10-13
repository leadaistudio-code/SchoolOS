export type GradingSystem = 'GRADES' | 'POINTS' | 'DESCRIPTIVE' | 'MARKS_ONLY'
export type GradingBasis = 'PERCENT' | 'MARKS'

export const SYSTEM_META: Record<GradingSystem, { label: string; hint: string }> = {
  GRADES: { label: 'Letter grades', hint: 'A1, A2, B1… or A+, A, B — with optional grade points' },
  POINTS: { label: 'Grade points (GPA / CGPA)', hint: 'Each band carries points, e.g. 10-point or 4.0 scale' },
  DESCRIPTIVE: { label: 'Descriptive', hint: 'Outstanding, Excellent, Good… — common for primary classes' },
  MARKS_ONLY: { label: 'Marks only (pass / fail)', hint: 'No grades on the report card — just marks and a pass mark' },
}
