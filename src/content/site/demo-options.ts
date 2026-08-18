/**
 * The four selects on the demo request form.
 *
 * Kept here because three places need them and they must not drift: the form
 * renders them, the API validates against them, and the enquiry email turns a
 * stored value back into the words the visitor actually saw. A label changed
 * in one place and not the others would put `3000_10000` in a sales inbox.
 *
 * Tuples rather than objects so the `Select` in the form can map them straight
 * to `<option>` pairs.
 */

export const SCHOOL_TYPE_OPTIONS = [
  ['PRIVATE_SCHOOL', 'Private school'],
  ['INTERNATIONAL_SCHOOL', 'International school'],
  ['PRESCHOOL', 'Preschool'],
  ['K12', 'K-12'],
  ['SCHOOL_GROUP', 'School group'],
  ['OTHER', 'Other'],
] as const

export const SIZE_OPTIONS = [
  ['UNDER_300', 'Under 300'],
  ['300_1000', '300 – 1,000'],
  ['1000_3000', '1,000 – 3,000'],
  ['3000_10000', '3,000 – 10,000'],
  ['OVER_10000', 'More than 10,000'],
] as const

export const INTEREST_OPTIONS = [
  ['EVERYTHING', 'The whole system'],
  ['STUDENT_RECORDS', 'Student records and academics'],
  ['FEES', 'Fees and finance'],
  ['TRANSPORT', 'Transport'],
  ['COMMUNICATION', 'Parent communication'],
  ['OTHER', 'Something else'],
] as const

export const CONTACT_PREFERENCE_OPTIONS = [
  ['PHONE', 'Phone'],
  ['EMAIL', 'Email'],
  ['WHATSAPP', 'WhatsApp'],
] as const

type Options = readonly (readonly [string, string])[]

/**
 * The stored values as a tuple type, so `z.enum` keeps the literal union
 * rather than widening to `string`. Adding an option to a list above is then
 * enough to make the API accept it.
 */
export function optionValues<T extends Options>(options: T) {
  return options.map(([value]) => value) as unknown as [T[number][0], ...T[number][0][]]
}

/** The words the visitor saw. Falls back to the raw value rather than blank. */
export function optionLabel(options: Options, value: string | undefined): string {
  if (!value) return ''
  return options.find(([stored]) => stored === value)?.[1] ?? value
}
