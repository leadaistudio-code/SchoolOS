import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { env } from '@/lib/env'
import { ROLE } from '@/lib/rbac/roles'

const ROUNDS = 12

/** Minimum length for teacher and parent passwords (numeric PINs allowed). */
export const PORTAL_PASSWORD_MIN_LENGTH = 6

const SIMPLE_PASSWORD_ROLES = new Set<string>([ROLE.TEACHER, ROLE.PARENT])

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

export type PasswordPolicyOptions = {
  /** Role keys on the account choosing the password. */
  roleKeys?: string[]
}

/**
 * Teachers and parents may use a short numeric password (min 6). Everyone else
 * keeps the full length + mixed-case + digit rules from PASSWORD_MIN_LENGTH.
 *
 * A user who also holds an admin-style role is held to the full policy.
 */
export function usesSimplePasswordPolicy(roleKeys: string[] | undefined): boolean {
  if (!roleKeys?.length) return false
  const hasSimple = roleKeys.some((key) => SIMPLE_PASSWORD_ROLES.has(key))
  if (!hasSimple) return false
  // Prefer the stricter rule when the same account is also an administrator.
  const elevated = roleKeys.some(
    (key) =>
      key === ROLE.SUPER_ADMIN ||
      key === ROLE.SCHOOL_ADMIN ||
      key === ROLE.PRINCIPAL ||
      key === ROLE.HR,
  )
  return !elevated
}

export function passwordPolicyHint(roleKeys?: string[]): string {
  if (usesSimplePasswordPolicy(roleKeys)) {
    return `At least ${PORTAL_PASSWORD_MIN_LENGTH} characters (digits are fine).`
  }
  const min = env().PASSWORD_MIN_LENGTH
  return `At least ${min} characters, with upper case, lower case and a number.`
}

export function passwordMinLength(roleKeys?: string[]): number {
  return usesSimplePasswordPolicy(roleKeys)
    ? PORTAL_PASSWORD_MIN_LENGTH
    : env().PASSWORD_MIN_LENGTH
}

/**
 * Password policy. Deliberately length-first for staff accounts: a long
 * passphrase beats a short password full of symbols. Teachers and parents get
 * a shorter bar so office-issued PINs and phone-friendly passwords work.
 */
export function checkPasswordPolicy(
  plain: string,
  opts?: PasswordPolicyOptions,
): PasswordPolicyIssue[] {
  const simple = usesSimplePasswordPolicy(opts?.roleKeys)
  const min = simple ? PORTAL_PASSWORD_MIN_LENGTH : env().PASSWORD_MIN_LENGTH
  const issues: string[] = []
  if (plain.length < min) issues.push(`Must be at least ${min} characters`)
  if (/^(.)\1+$/.test(plain)) issues.push('Must not be a single repeated character')
  if (!simple) {
    if (!/[a-z]/.test(plain)) issues.push('Must contain a lowercase letter')
    if (!/[A-Z]/.test(plain)) issues.push('Must contain an uppercase letter')
    if (!/[0-9]/.test(plain)) issues.push('Must contain a number')
  }
  return issues
}
