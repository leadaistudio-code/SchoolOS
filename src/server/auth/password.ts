import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { env } from '@/lib/env'

const ROUNDS = 12

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS)
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!hash) return false
  return bcrypt.compare(plain, hash)
}

/**
 * Consonants and vowels for generated passwords, with the letters that get
 * misheard or misread removed: no l/I/1, no O/0, no S/5.
 */
const CONSONANTS = 'bcdfghjkmnpqrtvwxz'
const VOWELS = 'aeuy'

/**
 * A temporary password an administrator can read down a phone line.
 *
 * Pronounceable syllables rather than random characters, because the failure
 * mode of this feature is not a weak password - it is a parent who cannot
 * transcribe it and calls the office back. Shape is `Tuqe-Vyra-Pown-8342`:
 * four syllable pairs and four digits, which satisfies the policy (length,
 * both cases, a digit) and carries roughly 50 bits of entropy.
 *
 * That is far weaker than a passphrase, and deliberately so - it is why the
 * caller pairs it with a short expiry and forces a change at first sign-in.
 */
export function generateTemporaryPassword(): string {
  const pick = (set: string) => set[crypto.randomInt(set.length)]!
  const chunk = () =>
    `${pick(CONSONANTS).toUpperCase()}${pick(VOWELS)}${pick(CONSONANTS)}${pick(VOWELS)}`

  const digits = String(crypto.randomInt(1000, 10000))
  return `${chunk()}-${chunk()}-${chunk()}-${digits}`
}

export type PasswordPolicyIssue = string

/**
 * Password policy. Deliberately length-first: a long passphrase beats a short
 * password full of symbols, and schools type these on phones.
 */
export function checkPasswordPolicy(plain: string): PasswordPolicyIssue[] {
  const min = env().PASSWORD_MIN_LENGTH
  const issues: string[] = []
  if (plain.length < min) issues.push(`Must be at least ${min} characters`)
  if (!/[a-z]/.test(plain)) issues.push('Must contain a lowercase letter')
  if (!/[A-Z]/.test(plain)) issues.push('Must contain an uppercase letter')
  if (!/[0-9]/.test(plain)) issues.push('Must contain a number')
  if (/^(.)\1+$/.test(plain)) issues.push('Must not be a single repeated character')
  return issues
}
