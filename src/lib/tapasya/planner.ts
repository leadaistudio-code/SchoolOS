/**
 * Frog of the Day planning.
 *
 * "Eat that frog": do the most important, hardest thing first. The score below
 * is deliberately simple enough to explain on screen — each suggestion carries
 * its reasons — because a student who cannot see why the app put chemistry
 * before maths will just ignore it.
 */

export type PlannerTask = {
  id: string
  title: string
  importance: number
  urgency: number
  difficulty: number
  estimatedMinutes: number
  /** YYYY-MM-DD in the school's timezone, or null. */
  dueOn: string | null
  isTeacherAssigned: boolean
  isMandatory: boolean
  status: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED'
  isPrimaryFrog?: boolean
  actualMinutes?: number
}

export type ScoredTask = PlannerTask & { score: number; reasons: string[]; daysToDue: number | null }

const DAY_MS = 86_400_000

function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00Z`)
  const b = Date.parse(`${toIso}T00:00:00Z`)
  return Math.round((b - a) / DAY_MS)
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

export function priorityScore(task: PlannerTask, today: string): ScoredTask {
  const reasons: string[] = []
  const importance = clamp(task.importance, 1, 5)
  const urgency = clamp(task.urgency, 1, 5)
  const difficulty = clamp(task.difficulty, 1, 5)
  let score = importance * 3 + urgency * 2 + difficulty

  if (importance >= 4) reasons.push('High importance')
  if (difficulty >= 4) reasons.push('Hard — best tackled while you are fresh')

  let daysToDue: number | null = null
  if (task.dueOn) {
    daysToDue = daysBetween(today, task.dueOn)
    if (daysToDue < 0) {
      score += 8
      reasons.push('Overdue')
    } else if (daysToDue === 0) {
      score += 6
      reasons.push('Due today')
    } else if (daysToDue === 1) {
      score += 4
      reasons.push('Due tomorrow')
    } else if (daysToDue <= 3) {
      score += 2
      reasons.push(`Due in ${daysToDue} days`)
    }
  }

  if (task.isTeacherAssigned) {
    score += task.isMandatory ? 4 : 2
    reasons.push(task.isMandatory ? 'Required by your teacher' : 'Set by your teacher')
  }

  return { ...task, score, reasons, daysToDue }
}

/** Highest priority first; ties go to the sooner deadline, then the shorter task. */
export function rankTasks(tasks: PlannerTask[], today: string): ScoredTask[] {
  return tasks
    .filter((t) => t.status === 'TODO' || t.status === 'IN_PROGRESS')
    .map((t) => priorityScore(t, today))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      const ad = a.daysToDue ?? Number.POSITIVE_INFINITY
      const bd = b.daysToDue ?? Number.POSITIVE_INFINITY
      if (ad !== bd) return ad - bd
      return a.estimatedMinutes - b.estimatedMinutes
    })
}

export type PlanItem = {
  taskId: string
  title: string
  order: number
  cycles: number
  focusMinutes: number
  plannedMinutes: number
  reasons: string[]
  isFrog: boolean
}

export type DayPlan = {
  items: PlanItem[]
  plannedMinutes: number
  availableMinutes: number
  /** Ranked tasks that did not fit today. Mandatory ones are flagged, never dropped silently. */
  deferred: { taskId: string; title: string; mandatory: boolean; reason: string }[]
}

/**
 * Lays the ranked tasks into the time available, in Pomodoro-sized cycles.
 * The top-ranked task is the suggested primary frog unless one is already set.
 */
export function suggestPlan(input: {
  tasks: PlannerTask[]
  today: string
  availableMinutes: number
  focusMinutes: number
  breakMinutes: number
}): DayPlan {
  const ranked = rankTasks(input.tasks, input.today)
  const focus = Math.max(1, input.focusMinutes)
  const items: PlanItem[] = []
  const deferred: DayPlan['deferred'] = []
  let used = 0
  const chosenFrog = ranked.find((t) => t.isPrimaryFrog) ?? ranked[0]

  for (const task of ranked) {
    const remaining = Math.max(0, task.estimatedMinutes - (task.actualMinutes ?? 0))
    const cycles = Math.max(1, Math.ceil(remaining / focus))
    const minutes = cycles * focus + Math.max(0, cycles - 1) * input.breakMinutes
    if (used + minutes > input.availableMinutes) {
      deferred.push({
        taskId: task.id,
        title: task.title,
        mandatory: task.isMandatory,
        reason: task.isMandatory
          ? 'Teacher-required: keep it on your list and plan time before it is due.'
          : 'Did not fit in today’s time.',
      })
      continue
    }
    used += minutes + (items.length > 0 ? input.breakMinutes : 0)
    items.push({
      taskId: task.id,
      title: task.title,
      order: items.length + 1,
      cycles,
      focusMinutes: focus,
      plannedMinutes: minutes,
      reasons: task.reasons,
      isFrog: task.id === chosenFrog?.id,
    })
  }

  return { items, plannedMinutes: used, availableMinutes: input.availableMinutes, deferred }
}

export type DayReview = {
  completed: { taskId: string; title: string; minutes: number }[]
  unfinished: { taskId: string; title: string; minutes: number; suggestion: string; mandatory: boolean }[]
  totalMinutes: number
  frogDone: boolean | null
}

/**
 * End-of-day review. Suggests rescheduling for the student's own tasks only;
 * a teacher's mandatory task is never moved — the suggestion says so.
 */
export function reviewDay(tasks: PlannerTask[], today: string, minutesByTask: Record<string, number>): DayReview {
  const completed: DayReview['completed'] = []
  const unfinished: DayReview['unfinished'] = []
  let totalMinutes = 0
  let frogDone: boolean | null = null

  for (const t of tasks) {
    const minutes = minutesByTask[t.id] ?? 0
    totalMinutes += minutes
    if (t.isPrimaryFrog) frogDone = t.status === 'DONE'
    if (t.status === 'DONE') {
      completed.push({ taskId: t.id, title: t.title, minutes })
    } else if (t.status !== 'CANCELLED') {
      const scored = priorityScore(t, today)
      let suggestion = 'Move to tomorrow.'
      if (t.isMandatory) suggestion = scored.daysToDue !== null && scored.daysToDue <= 0
        ? 'Required by your teacher and due — make it tomorrow’s frog.'
        : 'Required by your teacher — it stays on your list.'
      else if (scored.daysToDue !== null && scored.daysToDue <= 1) suggestion = 'Due soon — make it tomorrow’s frog.'
      unfinished.push({ taskId: t.id, title: t.title, minutes, suggestion, mandatory: t.isMandatory })
    }
  }

  return { completed, unfinished, totalMinutes, frogDone }
}
