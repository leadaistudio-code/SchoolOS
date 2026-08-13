import { z } from 'zod'

export const bookSchema = z.object({
  title: z.string().trim().min(1).max(200),
  author: z.string().trim().max(120).optional().or(z.literal('')).transform((v) => v || undefined),
  isbn: z.string().trim().max(32).optional().or(z.literal('')).transform((v) => v || undefined),
  categoryId: z.string().cuid().optional().or(z.literal('')).transform((v) => v || undefined),
  shelfCode: z.string().trim().max(40).optional().or(z.literal('')).transform((v) => v || undefined),
  totalCopies: z.coerce.number().int().min(1).max(500).default(1),
})

export type BookInput = z.infer<typeof bookSchema>

export const categorySchema = z.object({
  name: z.string().trim().min(1).max(80),
})

export const issueLoanSchema = z.object({
  bookId: z.string().cuid(),
  studentId: z.string().cuid().optional().or(z.literal('')).transform((v) => v || undefined),
  staffId: z.string().cuid().optional().or(z.literal('')).transform((v) => v || undefined),
  dueOn: z.coerce.date(),
  remarks: z.string().trim().max(400).optional().or(z.literal('')).transform((v) => v || undefined),
}).refine((v) => !!v.studentId || !!v.staffId, {
  message: 'Choose a student or staff member',
  path: ['studentId'],
})

export type IssueLoanInput = z.infer<typeof issueLoanSchema>

/** Fine in paise per overdue day. */
export const FINE_PER_DAY_MINOR = 500
