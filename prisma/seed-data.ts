/**
 * Deterministic pseudo-random helpers.
 *
 * The seed must be reproducible: the same command produces the same demo
 * school every time, so screenshots, tests and support conversations all refer
 * to the same records.
 */
export function makeRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0xffffffff
  }
}

export type Random = ReturnType<typeof makeRandom>

export function pick<T>(rand: Random, items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)]!
}

export function pickN<T>(rand: Random, items: readonly T[], n: number): T[] {
  const pool = [...items]
  const out: T[] = []
  while (out.length < n && pool.length > 0) {
    out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]!)
  }
  return out
}

export function intBetween(rand: Random, min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min
}

export function chance(rand: Random, probability: number): boolean {
  return rand() < probability
}

export const FIRST_NAMES_M = [
  'Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Reyansh', 'Krishna', 'Ishaan',
  'Kabir', 'Aryan', 'Rohan', 'Devansh', 'Rudra', 'Yash', 'Kartik', 'Nikhil',
  'Aman', 'Harsh', 'Manav', 'Ritvik', 'Samar', 'Tanish', 'Veer', 'Om',
]

export const FIRST_NAMES_F = [
  'Aadhya', 'Ananya', 'Diya', 'Ishita', 'Kavya', 'Myra', 'Navya', 'Pari',
  'Riya', 'Saanvi', 'Tara', 'Anika', 'Meera', 'Nitya', 'Sara', 'Trisha',
  'Vanya', 'Aarohi', 'Bhavya', 'Charvi', 'Ira', 'Kiara', 'Neha', 'Zara',
]

export const LAST_NAMES = [
  'Sharma', 'Verma', 'Gupta', 'Patel', 'Reddy', 'Nair', 'Iyer', 'Menon',
  'Chauhan', 'Rathore', 'Joshi', 'Malhotra', 'Kapoor', 'Bhatt', 'Desai',
  'Pillai', 'Mehta', 'Chopra', 'Sinha', 'Bose', 'Ghosh', 'Das', 'Rao', 'Shetty',
]

export const SUBJECTS = [
  { code: 'ENG', name: 'English' },
  { code: 'HIN', name: 'Hindi' },
  { code: 'MAT', name: 'Mathematics' },
  { code: 'SCI', name: 'Science' },
  { code: 'SST', name: 'Social Studies' },
  { code: 'CMP', name: 'Computer Science' },
  { code: 'PED', name: 'Physical Education' },
  { code: 'ART', name: 'Art & Craft' },
]

export const DESIGNATIONS = [
  'Senior Teacher',
  'Teacher',
  'Assistant Teacher',
  'Head of Department',
  'Coordinator',
]

export const DEPARTMENTS = ['Languages', 'Mathematics', 'Science', 'Humanities', 'Sports', 'Arts']

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'O+', 'O-']

export const CITIES = [
  { city: 'Gurugram', state: 'Haryana', postalCode: '122001' },
  { city: 'New Delhi', state: 'Delhi', postalCode: '110001' },
  { city: 'Noida', state: 'Uttar Pradesh', postalCode: '201301' },
  { city: 'Faridabad', state: 'Haryana', postalCode: '121001' },
]

export const BOOK_TITLES = [
  ['The Jungle Book', 'Rudyard Kipling', 'Macmillan'],
  ['Wings of Fire', 'A P J Abdul Kalam', 'Universities Press'],
  ['Malgudi Days', 'R K Narayan', 'Indian Thought'],
  ['The Alchemist', 'Paulo Coelho', 'HarperCollins'],
  ['A Brief History of Time', 'Stephen Hawking', 'Bantam'],
  ['Panchatantra Tales', 'Vishnu Sharma', 'Rupa'],
  ['Charlie and the Chocolate Factory', 'Roald Dahl', 'Puffin'],
  ['Harry Potter and the Philosopher Stone', 'J K Rowling', 'Bloomsbury'],
  ['The Diary of a Young Girl', 'Anne Frank', 'Penguin'],
  ['Discovery of India', 'Jawaharlal Nehru', 'Penguin'],
  ['Matilda', 'Roald Dahl', 'Puffin'],
  ['The Blue Umbrella', 'Ruskin Bond', 'Rupa'],
]

export const ASSET_ITEMS = [
  ['Desktop Computer', 'IT Equipment', 42000],
  ['Interactive Whiteboard', 'IT Equipment', 85000],
  ['Student Desk', 'Furniture', 3200],
  ['Staff Chair', 'Furniture', 4500],
  ['Microscope', 'Laboratory', 12500],
  ['Chemistry Lab Kit', 'Laboratory', 18000],
  ['Football Set', 'Sports', 2800],
  ['Basketball Hoop', 'Sports', 15000],
  ['Air Conditioner', 'Electrical', 38000],
  ['Projector', 'IT Equipment', 32000],
]

export const NOTICE_SEEDS = [
  ['Annual Sports Day - 12 December', 'The annual sports day will be held on the main ground. Parents are welcome from 9:00 AM. Students must report in house uniform by 8:15 AM.', 'HIGH'],
  ['Parent-Teacher Meeting', 'The term PTM is scheduled for Saturday. Slots are allotted class-wise; please check the timetable shared with your class teacher.', 'NORMAL'],
  ['Winter Break Timings', 'The school will remain closed for winter break. Office hours during the break will be 10:00 AM to 1:00 PM on working days.', 'NORMAL'],
  ['Fee Payment Reminder', 'The last date for the current quarter fee payment is approaching. Online payment is available in the parent portal under Finance.', 'HIGH'],
  ['Science Exhibition Entries Open', 'Students of classes 6 to 10 may register for the inter-house science exhibition with their science teacher.', 'LOW'],
]

export const HOMEWORK_SEEDS = [
  ['Chapter 4 exercises', 'Complete questions 1 to 12 from the chapter exercises. Show all working in the notebook.'],
  ['Reading comprehension', 'Read the passage on page 58 and answer the questions in complete sentences.'],
  ['Map work', 'Mark the major rivers on the outline map provided in class.'],
  ['Practice worksheet', 'Complete the worksheet handed out today. Bring it signed by a parent.'],
  ['Project draft', 'Prepare a one-page outline of your term project and submit for review.'],
]

export const CLASSWORK_SEEDS = [
  ['Introduction to fractions', 'Covered proper, improper and mixed fractions with examples on the board.'],
  ['The water cycle', 'Discussed evaporation, condensation and precipitation with a labelled diagram.'],
  ['Parts of speech', 'Revised nouns, pronouns and adjectives with sentence exercises.'],
  ['Mughal empire', 'Timeline of key rulers and their administrative reforms.'],
  ['Spreadsheet basics', 'Cells, rows, columns and simple SUM formulas.'],
]
