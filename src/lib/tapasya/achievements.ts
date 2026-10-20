/**
 * Achievements. Earned from the student's own validated history; each one
 * carries the platform's achievement XP once (idempotent per user and key).
 */

export type AchievementStats = {
  completedIntervals: number
  focusMinutes: number
  streakDays: number
  primaryFrogsDone: number
  activeDaysThisWeek: number
  intervalsThisWeek: number
}

export type Achievement = {
  key: string
  title: string
  description: string
  earned: (s: AchievementStats) => boolean
}

export const WEEKLY_INTERVAL_GOAL = 10

export const ACHIEVEMENTS: readonly Achievement[] = [
  { key: 'FIRST_FOCUS', title: 'First Focus Session', description: 'Complete your first focus interval.', earned: (s) => s.completedIntervals >= 1 },
  { key: 'STREAK_3', title: 'Focus Streak', description: 'Focus on three days in a row.', earned: (s) => s.streakDays >= 3 },
  { key: 'STREAK_7', title: 'Seven-Day Streak', description: 'Focus every day for a week.', earned: (s) => s.streakDays >= 7 },
  { key: 'FROG_CONQUEROR', title: 'Frog Conqueror', description: 'Finish five primary frogs.', earned: (s) => s.primaryFrogsDone >= 5 },
  { key: 'CONSISTENCY', title: 'Study Consistency', description: 'Focus on five different days in one week.', earned: (s) => s.activeDaysThisWeek >= 5 },
  { key: 'WEEKLY_GOAL', title: 'Weekly Goal Completed', description: `Complete ${WEEKLY_INTERVAL_GOAL} focus intervals in one week.`, earned: (s) => s.intervalsThisWeek >= WEEKLY_INTERVAL_GOAL },
  { key: 'DEEP_WORK_10H', title: 'Deep Work Milestone', description: 'Reach ten hours of completed focus.', earned: (s) => s.focusMinutes >= 600 },
]

export function earnedAchievementKeys(stats: AchievementStats): string[] {
  return ACHIEVEMENTS.filter((a) => a.earned(stats)).map((a) => a.key)
}

export function achievementByKey(key: string): Achievement | undefined {
  return ACHIEVEMENTS.find((a) => a.key === key)
}

/** Level L begins at 50·L·(L−1) XP: 0, 100, 300, 600, 1000, … */
export function levelFor(xp: number): { level: number; levelStartXp: number; nextLevelXp: number; progress: number } {
  const safe = Math.max(0, xp)
  let level = 1
  while (50 * (level + 1) * level <= safe) level += 1
  const levelStartXp = 50 * level * (level - 1)
  const nextLevelXp = 50 * (level + 1) * level
  return { level, levelStartXp, nextLevelXp, progress: (safe - levelStartXp) / (nextLevelXp - levelStartXp) }
}
