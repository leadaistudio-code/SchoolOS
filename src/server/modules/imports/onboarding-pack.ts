import * as XLSX from 'xlsx'
import { IMPORT_FIELDS } from './fields'

/**
 * The school onboarding workbook.
 *
 * One .xlsx a school fills in before go-live: profile, structure, people,
 * attendance, leave, academics, exams, fees and transport. Column names match
 * MyCampusView fields so the Students sheet imports without remapping.
 */

export type OnboardingSheet = {
  name: string
  purpose: string
  headers: string[]
  rows: string[][]
}

const STUDENT_HEADERS = IMPORT_FIELDS.map((f) => f.label)

export const ONBOARDING_SHEETS: OnboardingSheet[] = [
  {
    name: 'Read me',
    purpose: 'How to fill this pack',
    headers: ['Step', 'What to do'],
    rows: [
      ['1', 'Fill School and Session first. Every other sheet refers to them.'],
      ['2', 'Add Classes, then Sections, then Subjects and Class subjects.'],
      ['3', 'Add Staff (employee codes are unique). Class teacher uses the employee code.'],
      ['4', 'Add Students. Admission number is unique. Class and Section must match the Classes / Sections sheets.'],
      ['5', 'Add Parents. Use the student admission number to link. One row per guardian.'],
      ['6', 'Optional history: attendance, leave, marks, fees, transport. Leave a sheet blank if you do not have it yet.'],
      ['7', 'Dates are YYYY-MM-DD. Money is rupees (not paise). Gender is Male / Female / Other.'],
      ['8', 'Do not rename sheets. You may add rows. Do not insert a title row above the header.'],
      ['9', 'Upload this file on Students → Bulk import. The whole pack imports in one go — classes, staff, students and parents are linked automatically.'],
      ['10', 'Delete the sample rows before you send the real school data.'],
    ],
  },
  {
    name: 'Allowed values',
    purpose: 'Closed lists used across the pack',
    headers: ['Field', 'Allowed values'],
    rows: [
      ['Gender', 'Male | Female | Other'],
      ['Student status', 'ACTIVE | ALUMNI | TRANSFERRED | WITHDRAWN | SUSPENDED'],
      ['Staff type', 'TEACHING | ADMIN | SUPPORT | DRIVER | LIBRARIAN | ACCOUNTANT | OTHER'],
      ['Guardian relation', 'Father | Mother | Guardian | Other'],
      ['Attendance', 'PRESENT | ABSENT | LATE | HALF_DAY | LEAVE | HOLIDAY'],
      ['Leave applicant', 'STUDENT | STAFF'],
      ['Leave status', 'PENDING | APPROVED | REJECTED | CANCELLED'],
      ['Fee frequency', 'ONE_TIME | MONTHLY | QUARTERLY | HALF_YEARLY | ANNUAL'],
      ['Concession kind', 'PERCENT | FLAT'],
      ['Exam kind', 'UNIT_TEST | MID_TERM | FINAL | PRACTICAL | OTHER'],
      ['Day of week', '1 = Monday … 7 = Sunday'],
      ['Yes / No', 'Yes | No'],
    ],
  },
  {
    name: 'School',
    purpose: 'School profile',
    headers: [
      'School code',
      'School name',
      'Legal name',
      'Email',
      'Phone',
      'Website',
      'Address line 1',
      'Address line 2',
      'City',
      'State',
      'Country',
      'Postal code',
      'GSTIN',
      'Latitude',
      'Longitude',
      'Geofence radius m',
    ],
    rows: [
      [
        'DEMO-001',
        'Demo Public School',
        'Demo Public School Trust',
        'office@demo.school',
        '02212345678',
        'https://demo.school',
        '12 Park Street',
        '',
        'Mumbai',
        'Maharashtra',
        'India',
        '400001',
        '',
        '19.0760',
        '72.8777',
        '150',
      ],
    ],
  },
  {
    name: 'Session',
    purpose: 'Academic year',
    headers: ['Session name', 'Starts on', 'Ends on', 'Is current'],
    rows: [['2026-27', '2026-04-01', '2027-03-31', 'Yes']],
  },
  {
    name: 'Classes',
    purpose: 'Class levels for the current session',
    headers: ['Session name', 'Class', 'Numeric', 'Stream'],
    rows: [
      ['2026-27', 'Class 1', '1', ''],
      ['2026-27', 'Class 2', '2', ''],
    ],
  },
  {
    name: 'Sections',
    purpose: 'Sections under each class',
    headers: ['Class', 'Section', 'Capacity', 'Room', 'Class teacher employee code'],
    rows: [
      ['Class 1', 'A', '40', '101', 'EMP-T01'],
      ['Class 1', 'B', '40', '102', ''],
      ['Class 2', 'A', '40', '201', ''],
    ],
  },
  {
    name: 'Subjects',
    purpose: 'Subject catalogue',
    headers: ['Subject code', 'Subject name', 'Is elective'],
    rows: [
      ['ENG', 'English', 'No'],
      ['MAT', 'Mathematics', 'No'],
      ['HIN', 'Hindi', 'No'],
      ['EVS', 'EVS', 'No'],
    ],
  },
  {
    name: 'Class subjects',
    purpose: 'Which subjects each class takes, and who teaches them',
    headers: ['Class', 'Subject code', 'Teacher employee code', 'Periods per week'],
    rows: [
      ['Class 1', 'ENG', 'EMP-T01', '6'],
      ['Class 1', 'MAT', 'EMP-T01', '6'],
      ['Class 1', 'HIN', 'EMP-T01', '5'],
    ],
  },
  {
    name: 'Staff',
    purpose: 'Teachers and non-teaching staff',
    headers: [
      'Employee code',
      'First name',
      'Last name',
      'Staff type',
      'Designation',
      'Department',
      'Qualification',
      'Experience years',
      'Date of birth',
      'Gender',
      'Phone',
      'Email',
      'Joined on',
      'City',
      'State',
    ],
    rows: [
      [
        'EMP-T01',
        'Priya',
        'Iyer',
        'TEACHING',
        'Class teacher',
        'Primary',
        'B.Ed',
        '8',
        '1988-03-14',
        'Female',
        '9876500001',
        'priya.iyer@demo.school',
        '2018-06-01',
        'Mumbai',
        'Maharashtra',
      ],
      [
        'EMP-D01',
        'Suresh',
        'Patil',
        'DRIVER',
        'Driver',
        'Transport',
        '',
        '12',
        '1979-11-02',
        'Male',
        '9876500002',
        '',
        '2016-04-01',
        'Mumbai',
        'Maharashtra',
      ],
    ],
  },
  {
    name: 'Students',
    purpose: 'Student roll — this sheet is imported on upload',
    headers: STUDENT_HEADERS,
    rows: [
      [
        'ADM-2026-001',
        'Aarav',
        'Sharma',
        '2015-04-12',
        'Male',
        'B+',
        'General',
        'Hindu',
        'Indian',
        'Hindi',
        '2026-04-01',
        '',
        'Class 1',
        'A',
        '1',
        '12 Park Street',
        '',
        'Mumbai',
        'Maharashtra',
        '400001',
        'Ravi Sharma',
        '9876543210',
        '',
        '',
        'Ravi',
        'Sharma',
        'Father',
        '9876543210',
        'ravi@example.com',
        'Engineer',
      ],
      [
        'ADM-2026-002',
        'Ananya',
        'Patel',
        '2014-08-12',
        'Female',
        'O+',
        'General',
        'Hindu',
        'Indian',
        'Gujarati',
        '2026-04-01',
        '',
        'Class 1',
        'A',
        '2',
        '44 Lake Road',
        '',
        'Pune',
        'Maharashtra',
        '411001',
        'Meera Patel',
        '9876501234',
        '',
        '',
        'Meera',
        'Patel',
        'Mother',
        '9876501234',
        '',
        'Teacher',
      ],
    ],
  },
  {
    name: 'Parents',
    purpose: 'Guardians linked to students',
    headers: [
      'Student admission no',
      'Relation',
      'First name',
      'Last name',
      'Phone',
      'Email',
      'Occupation',
      'Is primary',
      'Can pickup',
      'Is emergency contact',
      'Address line 1',
      'City',
      'State',
      'Postal code',
    ],
    rows: [
      [
        'ADM-2026-001',
        'Father',
        'Ravi',
        'Sharma',
        '9876543210',
        'ravi@example.com',
        'Engineer',
        'Yes',
        'Yes',
        'Yes',
        '12 Park Street',
        'Mumbai',
        'Maharashtra',
        '400001',
      ],
      [
        'ADM-2026-001',
        'Mother',
        'Kavita',
        'Sharma',
        '9876543211',
        'kavita@example.com',
        'Doctor',
        'No',
        'Yes',
        'Yes',
        '12 Park Street',
        'Mumbai',
        'Maharashtra',
        '400001',
      ],
    ],
  },
  {
    name: 'Student attendance',
    purpose: 'Historical daily register (optional)',
    headers: ['Date', 'Admission no', 'Class', 'Section', 'Status', 'Minutes late', 'Remarks'],
    rows: [['2026-04-07', 'ADM-2026-001', 'Class 1', 'A', 'PRESENT', '', '']],
  },
  {
    name: 'Staff attendance',
    purpose: 'Historical staff register (optional)',
    headers: ['Date', 'Employee code', 'Status', 'Check in', 'Check out', 'Remarks'],
    rows: [['2026-04-07', 'EMP-T01', 'PRESENT', '08:05', '15:30', '']],
  },
  {
    name: 'Leave types',
    purpose: 'Leave categories',
    headers: ['Name', 'Applies to', 'Max per year', 'Is paid'],
    rows: [
      ['Sick leave', 'STUDENT', '12', 'Yes'],
      ['Casual leave', 'STAFF', '12', 'Yes'],
    ],
  },
  {
    name: 'Leave',
    purpose: 'Leave requests (optional history)',
    headers: [
      'Applicant type',
      'Admission no or employee code',
      'Leave type',
      'From',
      'To',
      'Reason',
      'Status',
    ],
    rows: [['STUDENT', 'ADM-2026-001', 'Sick leave', '2026-04-10', '2026-04-11', 'Fever', 'APPROVED']],
  },
  {
    name: 'Fee heads',
    purpose: 'Named charges',
    headers: ['Code', 'Name', 'Frequency', 'Is refundable', 'Is deposit'],
    rows: [
      ['TUI', 'Tuition', 'ANNUAL', 'No', 'No'],
      ['TRN', 'Transport', 'ANNUAL', 'No', 'No'],
      ['ADM', 'Admission fee', 'ONE_TIME', 'No', 'No'],
    ],
  },
  {
    name: 'Fee structures',
    purpose: 'Fee plans by class',
    headers: ['Session name', 'Structure name', 'Class', 'Description'],
    rows: [['2026-27', 'Class 1 annual', 'Class 1', 'Standard day-scholar fees']],
  },
  {
    name: 'Fee items',
    purpose: 'Amounts on each structure (rupees)',
    headers: ['Structure name', 'Fee head code', 'Amount INR', 'Due on'],
    rows: [
      ['Class 1 annual', 'TUI', '24000', '2026-04-15'],
      ['Class 1 annual', 'ADM', '5000', '2026-04-15'],
    ],
  },
  {
    name: 'Concessions',
    purpose: 'Per-student concessions',
    headers: ['Admission no', 'Name', 'Kind', 'Value', 'Fee head code', 'Reason'],
    rows: [['ADM-2026-002', 'Sibling concession', 'PERCENT', '50', 'TUI', 'Younger sibling']],
  },
  {
    name: 'Exams',
    purpose: 'Examinations in the session',
    headers: ['Session name', 'Exam name', 'Kind', 'Starts on', 'Ends on', 'Classes (comma)'],
    rows: [['2026-27', 'Unit Test 1', 'UNIT_TEST', '2026-07-14', '2026-07-18', 'Class 1, Class 2']],
  },
  {
    name: 'Exam timetable',
    purpose: 'Papers under each exam',
    headers: [
      'Exam name',
      'Class',
      'Subject code',
      'Max marks',
      'Pass marks',
      'Exam date',
      'Start time',
      'End time',
      'Room',
    ],
    rows: [['Unit Test 1', 'Class 1', 'ENG', '50', '17', '2026-07-14', '09:00', '10:30', '101']],
  },
  {
    name: 'Marks',
    purpose: 'Marks entry (optional)',
    headers: ['Exam name', 'Class', 'Subject code', 'Admission no', 'Marks obtained', 'Is absent', 'Remarks'],
    rows: [['Unit Test 1', 'Class 1', 'ENG', 'ADM-2026-001', '42', 'No', '']],
  },
  {
    name: 'Periods',
    purpose: 'Bell times',
    headers: ['Period name', 'Start time', 'End time', 'Sort order', 'Is break'],
    rows: [
      ['1', '08:00', '08:40', '1', 'No'],
      ['2', '08:40', '09:20', '2', 'No'],
      ['Break', '09:20', '09:40', '3', 'Yes'],
      ['3', '09:40', '10:20', '4', 'No'],
    ],
  },
  {
    name: 'Timetable',
    purpose: 'Weekly grid',
    headers: ['Class', 'Section', 'Day of week', 'Period name', 'Subject code', 'Teacher employee code', 'Room'],
    rows: [['Class 1', 'A', '1', '1', 'ENG', 'EMP-T01', '101']],
  },
  {
    name: 'Calendar',
    purpose: 'Holidays and school events',
    headers: ['Title', 'Kind', 'Starts on', 'Ends on', 'All day', 'Notes'],
    rows: [['Independence Day', 'HOLIDAY', '2026-08-15', '2026-08-15', 'Yes', '']],
  },
  {
    name: 'Buses',
    purpose: 'Fleet',
    headers: [
      'Bus code',
      'Registration no',
      'Model',
      'Capacity',
      'Driver employee code',
      'Attendant name',
      'Insurance expires on',
      'Fitness expires on',
    ],
    rows: [['BUS-01', 'MH01AB1234', 'Tata LP 407', '40', 'EMP-D01', 'Anita More', '2027-03-31', '2027-01-15']],
  },
  {
    name: 'Routes',
    purpose: 'Bus routes',
    headers: ['Route code', 'Route name', 'Bus code', 'Distance km'],
    rows: [['R-AND', 'Andheri loop', 'BUS-01', '18']],
  },
  {
    name: 'Stops',
    purpose: 'Ordered stops on a route',
    headers: [
      'Route code',
      'Stop name',
      'Sort order',
      'Pickup time',
      'Drop time',
      'Latitude',
      'Longitude',
      'Fare INR',
    ],
    rows: [['R-AND', 'Andheri station', '1', '07:10', '15:50', '19.1197', '72.8468', '12000']],
  },
  {
    name: 'Transport',
    purpose: 'Student to stop assignment',
    headers: ['Admission no', 'Route code', 'Stop name', 'Bus code'],
    rows: [['ADM-2026-001', 'R-AND', 'Andheri station', 'BUS-01']],
  },
]

export const ONBOARDING_PACK_FILENAME = 'mycampusview-onboarding-pack.xlsx'

const SKIP_SHEETS = new Set(['Read me', 'Allowed values'])
const STUDENT_SHEET_ALIASES = ['Students', 'Student', 'students']

export function buildOnboardingWorkbook(): Buffer {
  const workbook = XLSX.utils.book_new()
  for (const sheet of ONBOARDING_SHEETS) {
    const aoa = [sheet.headers, ...sheet.rows]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!cols'] = sheet.headers.map((h) => ({ wch: Math.min(36, Math.max(14, h.length + 2)) }))
    XLSX.utils.book_append_sheet(workbook, ws, sheet.name)
  }
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

export function pickImportSheetName(sheetNames: string[]): string | undefined {
  for (const alias of STUDENT_SHEET_ALIASES) {
    const hit = sheetNames.find((n) => n.toLowerCase() === alias.toLowerCase())
    if (hit) return hit
  }
  return sheetNames.find((n) => !SKIP_SHEETS.has(n)) ?? sheetNames[0]
}

export function isOnboardingPack(sheetNames: string[]): boolean {
  return sheetNames.includes('Students') && sheetNames.includes('School')
}
