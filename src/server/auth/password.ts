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
