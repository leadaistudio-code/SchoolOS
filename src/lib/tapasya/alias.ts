/**
 * Public leaderboard aliases.
 *
 * The board is visible to students at other schools, most of them minors, so
 * an alias must not identify anyone: no real name, no phone-like digit runs,
 * no email, no handle-style "@". Uniqueness is case- and space-insensitive.
 */

export const AVATAR_KEYS = ['lotus', 'owl', 'mountain', 'comet', 'banyan', 'peacock', 'river', 'lamp', 'tiger', 'kite'] as const
export type AvatarKey = (typeof AVATAR_KEYS)[number]

const RESERVED = ['admin', 'mycampus', 'mycampusview', 'moderator', 'official', 'support', 'teacher', 'principal', 'demo', 'sample', 'example', 'preview']
const BLOCKED = ['idiot', 'stupid', 'sex', 'porn', 'kill', 'hate', 'drug', 'damn', 'bitch', 'fuck', 'shit']

export function aliasKey(alias: string): string {
  return alias.trim().toLowerCase().replace(/[\s_]+/g, '')
}

export function validateAlias(alias: string, person: { firstName: string; lastName: string }): string[] {
  const errors: string[] = []
  const a = alias.trim()
  if (a.length < 3 || a.length > 20) errors.push('Use 3 to 20 characters.')
  if (!/^[A-Za-z][A-Za-z0-9_ ]*$/.test(a)) errors.push('Start with a letter; use only letters, numbers, spaces and underscores.')
  if (/\d{5,}/.test(a)) errors.push('Avoid long numbers — they can look like a phone or roll number.')
  const key = aliasKey(a)
  for (const name of [person.firstName, person.lastName]) {
    const n = aliasKey(name ?? '')
    if (n.length >= 3 && key.includes(n)) {
      errors.push('Leave your real name out of your alias.')
      break
    }
  }
  if (RESERVED.some((r) => key.includes(r))) errors.push('That alias is reserved.')
  if (BLOCKED.some((b) => key.includes(b))) errors.push('Please choose a friendlier alias.')
  return errors
}
