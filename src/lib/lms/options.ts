export const LMS_CATEGORIES = [
  { value: 'ROBOTICS', label: 'Robotics', colour: '#6366f1' },
  { value: 'AI', label: 'Artificial intelligence', colour: '#ec4899' },
  { value: 'CODING', label: 'Coding', colour: '#0ea5e9' },
  { value: 'ELECTRONICS', label: 'Electronics', colour: '#f59e0b' },
  { value: 'IOT', label: 'Internet of Things', colour: '#10b981' },
  { value: 'DRONES', label: 'Drones', colour: '#8b5cf6' },
  { value: 'OTHER', label: 'Other', colour: '#64748b' },
] as const

export type LmsCategory = (typeof LMS_CATEGORIES)[number]['value']

export function lmsCategory(value: string) {
  return LMS_CATEGORIES.find((c) => c.value === value) ?? LMS_CATEGORIES[LMS_CATEGORIES.length - 1]!
}

export const LMS_LEVELS = [
  { value: 'BEGINNER', label: 'Beginner' },
  { value: 'INTERMEDIATE', label: 'Intermediate' },
  { value: 'ADVANCED', label: 'Advanced' },
] as const

export function lmsLevelLabel(value: string) {
  return LMS_LEVELS.find((l) => l.value === value)?.label ?? value
}

export const LMS_LESSON_KINDS = [
  { value: 'VIDEO', label: 'Video', icon: 'PlayCircle' },
  { value: 'TEXT', label: 'Reading', icon: 'FileText' },
  { value: 'DOCUMENT', label: 'Document / slides', icon: 'FileStack' },
  { value: 'CODE', label: 'Code', icon: 'Code2' },
  { value: 'QUIZ', label: 'Quiz', icon: 'ListChecks' },
  { value: 'PROJECT', label: 'Project', icon: 'Wrench' },
] as const

export type LmsLessonKind = (typeof LMS_LESSON_KINDS)[number]['value']

export function lessonKind(value: string) {
  return LMS_LESSON_KINDS.find((k) => k.value === value) ?? LMS_LESSON_KINDS[1]
}

export const CODE_LANGUAGES = ['python', 'arduino', 'cpp', 'javascript', 'blocks', 'other'] as const

/** Starting values for the lesson editor. */
export function blankLesson() {
  return {
    title: '',
    kind: 'VIDEO',
    durationMinutes: null,
    videoUrl: null,
    body: null,
    documentUrl: null,
    codeLanguage: null,
    code: null,
    quiz: null,
    passPercent: 60,
  }
}

export function gradeRange(from: number | null, to: number | null) {
  if (from && to) return from === to ? `Class ${from}` : `Classes ${from}–${to}`
  if (from) return `Class ${from}+`
  if (to) return `Up to class ${to}`
  return null
}

export type QuizOption = { id: string; text: string; correct: boolean }
export type QuizQuestion = { id: string; prompt: string; multiple: boolean; options: QuizOption[]; explanation?: string }
export type Quiz = { questions: QuizQuestion[] }

/** What a learner is sent before answering: no correct flags, no explanations. */
export type PublicQuizQuestion = { id: string; prompt: string; multiple: boolean; options: { id: string; text: string }[] }

export function publicQuiz(quiz: Quiz | null | undefined): PublicQuizQuestion[] {
  return (quiz?.questions ?? []).map((q) => ({
    id: q.id,
    prompt: q.prompt,
    multiple: q.multiple,
    options: q.options.map((o) => ({ id: o.id, text: o.text })),
  }))
}

export type QuizResult = {
  correctCount: number
  totalCount: number
  scorePercent: number
  passed: boolean
  questions: { id: string; correct: boolean; correctOptionIds: string[]; explanation?: string }[]
}

/** A question is right only when exactly its correct options were chosen. */
export function gradeQuiz(quiz: Quiz, answers: Record<string, string[]>, passPercent: number): QuizResult {
  const questions = quiz.questions.map((q) => {
    const want = q.options.filter((o) => o.correct).map((o) => o.id).sort()
    const got = [...new Set(answers[q.id] ?? [])].sort()
    const correct = want.length > 0 && want.length === got.length && want.every((id, i) => id === got[i])
    return { id: q.id, correct, correctOptionIds: want, explanation: q.explanation }
  })
  const correctCount = questions.filter((q) => q.correct).length
  const totalCount = questions.length
  const scorePercent = totalCount ? Math.round((correctCount / totalCount) * 100) : 0
  return { correctCount, totalCount, scorePercent, passed: scorePercent >= passPercent, questions }
}
