import { describe, expect, it } from 'vitest'
import { parseCsv, toCsv } from '../src/lib/csv'
import { gridToTable } from '../src/lib/spreadsheet'
import { autoMapHeaders, IMPORT_FIELDS } from '../src/server/modules/imports/fields'
import { sampleStudentCsv } from '../src/server/modules/imports/service'

describe('csv parser', () => {
  it('parses quoted commas and escaped quotes', () => {
    const table = parseCsv('Name,Note\n"Sharma, Aarav","Said ""present"""\n')
    expect(table.headers).toEqual(['Name', 'Note'])
    expect(table.rows).toEqual([{ Name: 'Sharma, Aarav', Note: 'Said "present"' }])
  })

  it('skips blank data rows and strips a BOM', () => {
    const table = parseCsv('\uFEFFA,B\n1,2\n,\n3,4\n')
    expect(table.rows).toHaveLength(2)
    expect(table.rows[0]).toEqual({ A: '1', B: '2' })
    expect(table.rows[1]).toEqual({ A: '3', B: '4' })
  })

  it('round-trips the sample template', () => {
    const csv = sampleStudentCsv()
    const table = parseCsv(csv)
    expect(table.headers[0]).toBe('Admission No')
    expect(table.rows).toHaveLength(2)
    expect(table.rows[0]?.['First Name']).toBe('Aarav')
  })

  it('escapes values when serialising', () => {
    expect(toCsv(['a', 'b'], [['x,y', 'z']])).toBe('a,b\n"x,y",z')
  })
})

describe('import column auto-map', () => {
  it('maps a typical school export onto required fields', () => {
    const mapping = autoMapHeaders([
      'Admission No',
      'First Name',
      'Last Name',
      'Class',
      'Section',
      'Father Phone',
      'DOB',
      'Gender',
    ])

    expect(mapping.admissionNo).toBe('Admission No')
    expect(mapping.firstName).toBe('First Name')
    expect(mapping.lastName).toBe('Last Name')
    expect(mapping.className).toBe('Class')
    expect(mapping.sectionName).toBe('Section')
    expect(mapping.guardianPhone).toBe('Father Phone')
    expect(mapping.dateOfBirth).toBe('DOB')
    expect(mapping.gender).toBe('Gender')
  })

  it('never assigns the same header to two fields', () => {
    const mapping = autoMapHeaders(['Name', 'Class', 'Section', 'Admission No', 'Last Name'])
    const used = Object.values(mapping).filter(Boolean)
    expect(new Set(used).size).toBe(used.length)
  })

  it('maps Father Name to the guardian, not the student', () => {
    const mapping = autoMapHeaders([
      'Admission No',
      'First Name',
      'Last Name',
      'Class',
      'Section',
      'Father Name',
    ])
    expect(mapping.firstName).toBe('First Name')
    expect(mapping.guardianFirstName).toBe('Father Name')
  })

  it('covers every declared import field key', () => {
    const mapping = autoMapHeaders([])
    for (const field of IMPORT_FIELDS) {
      expect(mapping).toHaveProperty(field.key)
    }
  })
})

describe('spreadsheet grid', () => {
  it('converts a grid with a title row into a table', () => {
    const grid = [
      ['Springfield Public School — Student List 2026'],
      ['Admission No', 'First Name', 'Last Name', 'Class', 'Section'],
      ['A1', 'Aarav', 'Sharma', 'Class 1', 'A'],
    ]
    const table = gridToTable(grid, 1)
    expect(table.headers).toEqual(['Admission No', 'First Name', 'Last Name', 'Class', 'Section'])
    expect(table.rows).toHaveLength(1)
    expect(table.rows[0]?.['First Name']).toBe('Aarav')
  })

  it('reads the Students sheet from the onboarding pack', async () => {
    const { parseSpreadsheet } = await import('../src/lib/spreadsheet')
    const { buildOnboardingWorkbook, ONBOARDING_SHEETS } = await import(
      '../src/server/modules/imports/onboarding-pack'
    )
    const { autoMapHeaders, IMPORT_FIELDS } = await import('../src/server/modules/imports/fields')

    for (const sheet of ONBOARDING_SHEETS) {
      for (const row of sheet.rows) {
        expect(row.length, `${sheet.name} sample row width`).toBe(sheet.headers.length)
      }
    }

    const students = ONBOARDING_SHEETS.find((s) => s.name === 'Students')!
    expect(students.headers).toEqual(IMPORT_FIELDS.map((f) => f.label))

    const parsed = parseSpreadsheet(
      buildOnboardingWorkbook(),
      'mycampusview-onboarding-pack.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    expect(parsed.sheetName).toBe('Students')
    expect(parsed.sheetNames).toContain('School')
    expect(parsed.sheetNames).toContain('Transport')

    const table = gridToTable(parsed.grid, 0)
    const mapping = autoMapHeaders(table.headers)
    expect(mapping.admissionNo).toBe('Admission number')
    expect(mapping.firstName).toBe('First name')
    expect(mapping.className).toBe('Class')
    expect(mapping.guardianPhone).toBe('Guardian phone')
    expect(table.rows[0]?.['Admission number']).toBe('ADM-2026-001')
  })
})

describe('AI import output normalisation', () => {
  it('accepts OpenAI-style null optionals without failing Zod', async () => {
    const { parseImportAnalysisOutput } = await import('../src/server/modules/imports/ai-map')

    const parsed = parseImportAnalysisOutput(
      JSON.stringify({
        headerRowIndex: 1,
        mapping: {
          admissionNo: 'Adm No',
          firstName: 'Name',
          lastName: null,
          className: 'Class',
          sectionName: null,
        },
        summary: 'Header on row 1; name is a single column.',
        notes: null,
        questions: [
          {
            id: 'section_col',
            prompt: 'Which column holds the section?',
            kind: 'pick_column',
            options: null,
            relatedField: null,
            examples: null,
          },
        ],
        classAliases: null,
        splitFullNameColumn: 'Name',
      }),
    )

    expect(parsed.headerRowIndex).toBe(1)
    expect(parsed.mapping.firstName).toBe('Name')
    expect(parsed.mapping.lastName).toBeNull()
    expect(parsed.notes).toBeUndefined()
    expect(parsed.classAliases).toBeUndefined()
    expect(parsed.splitFullNameColumn).toBe('Name')
    expect(parsed.questions).toHaveLength(1)
    expect(parsed.questions[0]?.options).toBeUndefined()
  })
})
