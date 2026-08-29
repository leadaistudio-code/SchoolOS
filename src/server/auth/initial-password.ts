import { toDateInput } from '@/lib/dates'

/**
 * Initial portal passwords handed to parents and staff.
 *
 * These are hashed at account creation and never recomputed at login — after
 * the first password change the formula no longer works.
 */

/** Parent: child first name (lower, no spaces) + DOB as YYYYMMDD. */
export function parentInitialPassword(childFirstName: string, dateOfBirth: Date | string): string {
  const name = childFirstName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9]/g, '')
  if (!name) throw new Error('Child first name is required for the parent password')

  const iso =
    typeof dateOfBirth === 'string'
      ? dateOfBirth.slice(0, 10)
      : toDateInput(dateOfBirth)
  const yyyymmdd = iso.replace(/-/g, '')
  if (!/^\d{8}$/.test(yyyymmdd)) {
    throw new Error('Child date of birth is required for the parent password')
  }

  return `${name}${yyyymmdd}`
}

/** Staff / accountant / front desk: employee code as stored. */
export function staffInitialPassword(employeeCode: string): string {
  const code = employeeCode.trim()
  if (!code) throw new Error('Employee code is required for the staff password')
  return code
}
