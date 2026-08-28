/**
 * Target fields for a student CSV import.
 *
 * Headers from a school spreadsheet are mapped onto these keys. Aliases drive
 * the automatic first-guess so a common Indian school export needs little or
 * no hand mapping.
 */

export type ImportFieldKey =
  | 'admissionNo'
  | 'firstName'
  | 'lastName'
  | 'dateOfBirth'
  | 'gender'
  | 'bloodGroup'
  | 'category'
  | 'religion'
  | 'nationality'
  | 'motherTongue'
  | 'admissionDate'
  | 'previousSchool'
  | 'className'
  | 'sectionName'
  | 'rollNumber'
  | 'addressLine1'
  | 'addressLine2'
  | 'city'
  | 'state'
  | 'postalCode'
  | 'emergencyContactName'
  | 'emergencyContactPhone'
  | 'medicalNotes'
  | 'allergies'
  | 'parentName'
  | 'guardianPhone'
  | 'guardianEmail'
  | 'guardianOccupation'

export type ImportFieldDef = {
  key: ImportFieldKey
  label: string
  required?: boolean
  aliases: string[]
}

export const IMPORT_FIELDS: ImportFieldDef[] = [
  {
    key: 'admissionNo',
    label: 'Admission number',
    required: true,
    aliases: ['admission no', 'admission number', 'admissionno', 'adm no', 'adm. no', 'admission'],
  },
  {
    key: 'firstName',
    label: 'First name',
    required: true,
    aliases: ['first name', 'firstname', 'student first name', 'given name', 'name'],
  },
  {
    key: 'lastName',
    label: 'Last name',
    required: true,
    aliases: ['last name', 'lastname', 'surname', 'student last name', 'family name'],
  },
  {
    key: 'dateOfBirth',
    label: 'Date of birth',
    aliases: ['date of birth', 'dob', 'birth date', 'birthday', 'd.o.b'],
  },
  {
    key: 'gender',
    label: 'Gender',
    aliases: ['gender', 'sex'],
  },
  {
    key: 'bloodGroup',
    label: 'Blood group',
    aliases: ['blood group', 'bloodgroup', 'blood'],
  },
  {
    key: 'category',
    label: 'Category',
    aliases: ['category', 'caste category', 'social category'],
  },
  {
    key: 'religion',
    label: 'Religion',
    aliases: ['religion'],
  },
  {
    key: 'nationality',
    label: 'Nationality',
    aliases: ['nationality'],
  },
  {
    key: 'motherTongue',
    label: 'Mother tongue',
    aliases: ['mother tongue', 'mothertongue', 'language'],
  },
  {
    key: 'admissionDate',
    label: 'Admission date',
    aliases: ['admission date', 'date of admission', 'admitted on'],
  },
  {
    key: 'previousSchool',
    label: 'Previous school',
    aliases: ['previous school', 'last school', 'old school'],
  },
  {
    key: 'className',
    label: 'Class',
    required: true,
    aliases: ['class', 'class name', 'grade', 'standard', 'std', 'class/grade'],
  },
  {
    key: 'sectionName',
    label: 'Section',
    required: true,
    aliases: ['section', 'section name', 'div', 'division', 'sec'],
  },
  {
    key: 'rollNumber',
    label: 'Roll number',
    aliases: ['roll number', 'roll no', 'rollno', 'roll', 'class roll'],
  },
  {
    key: 'addressLine1',
    label: 'Address line 1',
    aliases: ['address', 'address line 1', 'address1', 'street'],
  },
  {
    key: 'addressLine2',
    label: 'Address line 2',
    aliases: ['address line 2', 'address2', 'landmark'],
  },
  {
    key: 'city',
    label: 'City',
    aliases: ['city', 'town'],
  },
  {
    key: 'state',
    label: 'State',
    aliases: ['state', 'province'],
  },
  {
    key: 'postalCode',
    label: 'Postal code',
    aliases: ['postal code', 'pincode', 'pin code', 'zip', 'zip code'],
  },
  {
    key: 'emergencyContactName',
    label: 'Emergency contact name',
    aliases: ['emergency contact', 'emergency contact name', 'emergency name'],
  },
  {
    key: 'emergencyContactPhone',
    label: 'Emergency contact phone',
    aliases: ['emergency phone', 'emergency contact phone', 'emergency mobile'],
  },
  {
    key: 'medicalNotes',
    label: 'Medical notes',
    aliases: ['medical notes', 'medical', 'health notes'],
  },
  {
    key: 'allergies',
    label: 'Allergies',
    aliases: ['allergies', 'allergy'],
  },
  {
    key: 'parentName',
    label: 'Parent name',
    aliases: [
      'parent name',
      'guardian name',
      'parent',
      'guardian',
      'father name',
      'mother name',
      'parent/guardian name',
      'guardian first name',
      'parent first name',
    ],
  },
  {
    key: 'guardianPhone',
    label: 'Parent phone',
    aliases: [
      'guardian phone',
      'parent phone',
      'father phone',
      'mother phone',
      'mobile',
      'phone',
      'contact number',
    ],
  },
  {
    key: 'guardianEmail',
    label: 'Parent email',
    aliases: ['guardian email', 'parent email', 'email'],
  },
  {
    key: 'guardianOccupation',
    label: 'Parent occupation',
    aliases: ['guardian occupation', 'parent occupation', 'occupation'],
  },
]

export const REQUIRED_IMPORT_FIELDS = IMPORT_FIELDS.filter((f) => f.required).map((f) => f.key)

function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_./\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Guess a mapping from spreadsheet headers onto import fields.
 * Each field and each header is used at most once.
 */
export function autoMapHeaders(headers: string[]): Record<ImportFieldKey, string | null> {
  const mapping = Object.fromEntries(
    IMPORT_FIELDS.map((f) => [f.key, null]),
  ) as Record<ImportFieldKey, string | null>

  const unused = new Set(headers)

  for (const field of IMPORT_FIELDS) {
    let match: string | null = null
    for (const header of unused) {
      const n = normalizeHeader(header)
      if (field.aliases.some((alias) => n === alias || n === normalizeHeader(field.label))) {
        match = header
        break
      }
    }
    if (!match) {
      for (const header of unused) {
        const n = normalizeHeader(header)
        // Short aliases ("name", "sex") only match exactly — substring matching
        // would steal headers like "Father Name" for the student first name.
        if (
          field.aliases.some((alias) => {
            if (alias.length < 5) return false
            return n.includes(alias) || (alias.includes(n) && n.length >= 5)
          })
        ) {
          match = header
          break
        }
      }
    }
    if (match) {
      mapping[field.key] = match
      unused.delete(match)
    }
  }

  return mapping
}

export const SAMPLE_CSV_HEADERS = [
  'Admission No',
  'First Name',
  'Last Name',
  'Date of Birth',
  'Gender',
  'Class',
  'Section',
  'Roll Number',
  'Parent Name',
  'Parent Phone',
  'Parent Email',
  'City',
  'State',
] as const

export const SAMPLE_CSV_ROWS: string[][] = [
  [
    'ADM-2026-001',
    'Aarav',
    'Sharma',
    '2015-04-12',
    'Male',
    'Class 1',
    'A',
    '1',
    'Ravi Sharma',
    '9876543210',
    'ravi@example.com',
    'Mumbai',
    'Maharashtra',
  ],
  [
    'ADM-2026-002',
    'Ananya',
    'Patel',
    '12/08/2014',
    'F',
    'Class 1',
    'A',
    '2',
    'Meera Patel',
    '9876501234',
    '',
    'Pune',
    'Maharashtra',
  ],
]
