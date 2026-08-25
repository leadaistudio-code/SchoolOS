/**
 * The student document catalogue.
 *
 * Held as a plain list rather than a database table on purpose: these are the
 * categories an Indian school is actually asked for at admission and at board
 * registration, they are the same at every school, and a free-text category
 * would make the missing-document report unanswerable — "Birth Cert.",
 * "birth certificate" and "DOB proof" would all be different piles.
 *
 * No server imports here. The upload dialog, the filters and the coverage
 * report all read this same list, so a category can never exist on one screen
 * and not another.
 */

export type StudentDocumentCategory = {
  key: string
  label: string
  /**
   * Part of the file every student is expected to have.
   *
   * This drives the missing-document report, so the set is deliberately small:
   * a report that flags every child for a document only some of them need is a
   * report nobody reads twice. A transfer certificate is the clearest example
   * — a child joining in Nursery has no previous school to have left.
   */
  required?: boolean
  /** Offers the expiry field on upload and includes it in the expiry report. */
  expires?: boolean
  hint?: string
}

export const STUDENT_DOCUMENT_CATEGORIES: StudentDocumentCategory[] = [
  {
    key: 'BIRTH_CERTIFICATE',
    label: 'Birth certificate',
    required: true,
    hint: 'Proof of the date of birth on the record',
  },
  {
    key: 'AADHAAR',
    label: 'Aadhaar',
    required: true,
    hint: "The student's own Aadhaar, not a guardian's",
  },
  {
    key: 'PHOTOGRAPH',
    label: 'Photograph',
    required: true,
    hint: 'Passport size, used on the ID card and report card',
  },
  {
    key: 'TRANSFER_CERTIFICATE',
    label: 'Transfer certificate',
    hint: 'From the previous school. Not applicable to a first admission.',
  },
  {
    key: 'PREVIOUS_MARKSHEET',
    label: 'Previous marksheet',
    hint: 'Last result from the previous school',
  },
  { key: 'ADDRESS_PROOF', label: 'Address proof' },
  { key: 'CASTE_CERTIFICATE', label: 'Caste / category certificate' },
  {
    key: 'INCOME_CERTIFICATE',
    label: 'Income certificate',
    expires: true,
    hint: 'Usually valid for one financial year',
  },
  {
    key: 'MEDICAL_RECORD',
    label: 'Medical record',
    expires: true,
    hint: 'Immunisation card, fitness certificate, allergy note',
  },
  { key: 'BANK_PASSBOOK', label: 'Bank passbook', hint: 'For scholarship and refund transfers' },
  { key: 'GUARDIAN_ID', label: 'Guardian ID' },
  { key: 'OTHER', label: 'Other' },
]

/**
 * The category a profile photo is stored under.
 *
 * Deliberately NOT in `STUDENT_DOCUMENT_CATEGORIES`: the avatar is not a piece
 * of the admission file, so it must never appear in the register, the upload
 * picker or the missing-document report. It is separate from `PHOTOGRAPH` (the
 * passport-size ID-card photo, which IS a required document) — the two answer
 * different questions and a school may hold one without the other.
 */
export const PROFILE_PHOTO_CATEGORY = 'PROFILE_PHOTO'

/**
 * The image types a profile photo may be.
 *
 * `uploadFile`'s allow-list is deliberately broader — it also accepts PDFs and
 * Office documents, because it backs every attachment in the app — so the
 * avatar setters narrow it to real images with this list. Without it a PDF sent
 * through the avatar control (the `accept` attribute is only a client hint) is
 * accepted and then renders as a broken `<img>` on every roster, score page and
 * the parent portal. The bytes are still checked against the declared type
 * downstream in `uploadFile`, so a document mislabelled `image/png` is caught
 * there; this list is what refuses one honestly labelled `application/pdf`.
 */
export const PROFILE_PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

export function isProfilePhotoMime(mime: string): boolean {
  return (PROFILE_PHOTO_MIME_TYPES as readonly string[]).includes(mime)
}

/** The categories the missing-document report checks for. */
export const REQUIRED_DOCUMENT_KEYS = STUDENT_DOCUMENT_CATEGORIES.filter((c) => c.required).map(
  (c) => c.key,
)

const BY_KEY = new Map(STUDENT_DOCUMENT_CATEGORIES.map((c) => [c.key, c]))

/**
 * A stored category is rendered through this rather than through a lookup that
 * can return undefined: a row uploaded before a category was renamed still has
 * to draw as something a human can read.
 */
export function documentCategoryLabel(key: string): string {
  return BY_KEY.get(key)?.label ?? key.replace(/_/g, ' ').toLowerCase()
}

export function documentCategory(key: string): StudentDocumentCategory | undefined {
  return BY_KEY.get(key)
}

/** How long before an expiry date the document starts reading as a warning. */
export const EXPIRY_WARNING_DAYS = 45

export type ExpiryState = 'none' | 'valid' | 'soon' | 'expired'

export function expiryState(expiresOn: Date | string | null | undefined, now = new Date()): ExpiryState {
  if (!expiresOn) return 'none'
  const due = new Date(expiresOn)
  if (Number.isNaN(due.getTime())) return 'none'

  const days = Math.floor((due.getTime() - now.getTime()) / 86_400_000)
  if (days < 0) return 'expired'
  if (days <= EXPIRY_WARNING_DAYS) return 'soon'
  return 'valid'
}

/** Accepted upload types, mirroring the allow-list in `server/files.ts`. */
export const DOCUMENT_ACCEPT =
  'application/pdf,image/jpeg,image/png,image/webp,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
