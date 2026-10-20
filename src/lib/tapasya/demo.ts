/**
 * The example leaderboard.
 *
 * Shown only on the separate "See an example" view, never mixed into a live
 * ranking, never stored, and never attributed to a real student. Every alias
 * says it is a sample, and the response carries `demo: true` so no client can
 * render it as live competition by accident.
 */

export type DemoRow = { rank: number; alias: string; avatarKey: string; xp: number; badges: string[]; demo: true }

const SAMPLE_XP = [1240, 1185, 1090, 1010, 960, 905, 860, 790, 745, 700, 655, 610]
const AVATARS = ['lotus', 'owl', 'mountain', 'comet', 'banyan', 'peacock', 'river', 'lamp', 'tiger', 'kite', 'lotus', 'owl']

export function demoLeaderboard(): DemoRow[] {
  return SAMPLE_XP.map((xp, i) => ({
    rank: i + 1,
    alias: `Sample Learner ${String(i + 1).padStart(2, '0')}`,
    avatarKey: AVATARS[i] ?? 'lotus',
    xp,
    badges: i < 3 ? ['STREAK_7'] : i < 6 ? ['FIRST_FOCUS'] : [],
    demo: true as const,
  }))
}
