'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireContext } from '@/server/context'
import {
  examAttendanceMarkSchema,
  examAttendanceScanSchema,
  markExamAttendance,
  scanExamAttendance,
} from '@/server/modules/exams/attendance'

export type ScanResult = {
  ok: boolean
  message: string
  duplicate?: boolean
  studentId?: string
  studentName?: string
  admissionNo?: string
  photoUrl?: string | null
  className?: string
  checkedInAt?: string | null
}

const bulkExamAttendanceSchema = z.object({
  examId: z.string().min(1),
  examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  studentIds: z.array(z.string().min(1)).min(1).max(200),
  status: z.enum(['PRESENT', 'ABSENT']),
})

export async function scanExamAttendanceAction(
  examId: string,
  payload: unknown,
): Promise<ScanResult> {
  try {
    const ctx = await requireContext('exams.attendance')
    const parsed = examAttendanceScanSchema.parse({
      ...(payload as object),
      examId,
    })
    const result = await scanExamAttendance(ctx, parsed)
    revalidatePath(`/exams/${examId}/attendance`)
    const paperNote =
      result.papersTotal > 1
        ? ` · ${result.papersTotal} paper${result.papersTotal === 1 ? '' : 's'} on this date`
        : ''
    return {
      ok: true,
      message: result.duplicate
        ? `${result.studentName} was already checked in${paperNote}.`
        : `${result.studentName} checked in successfully${paperNote}.`,
      duplicate: result.duplicate,
      studentId: result.studentId,
      studentName: result.studentName,
      admissionNo: result.admissionNo,
      photoUrl: result.photoUrl,
      className: result.className,
      checkedInAt: result.checkedInAt?.toISOString() ?? null,
    }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'The barcode could not be accepted',
    }
  }
}

export async function markExamAttendanceAction(
  examId: string,
  payload: unknown,
): Promise<{ ok: boolean; message: string }> {
  try {
    const ctx = await requireContext('exams.attendance')
    const input = examAttendanceMarkSchema.parse({
      ...(payload as object),
      examId,
    })
    const result = await markExamAttendance(ctx, input)
    revalidatePath(`/exams/${examId}/attendance`)
    return {
      ok: true,
      message: `Student marked ${input.status.toLowerCase()} for ${result.papersTotal} paper${result.papersTotal === 1 ? '' : 's'}.`,
    }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Attendance could not be updated',
    }
  }
}

export async function bulkMarkExamAttendanceAction(
  examId: string,
  payload: {
    examDate: string
    studentIds: string[]
    status: 'PRESENT' | 'ABSENT'
  },
): Promise<{ ok: boolean; message: string }> {
  try {
    const ctx = await requireContext('exams.attendance')
    const input = bulkExamAttendanceSchema.parse({ ...payload, examId })
    const studentIds = [...new Set(input.studentIds)]

    let updated = 0
    const failures: string[] = []
    for (let offset = 0; offset < studentIds.length; offset += 10) {
      const batch = studentIds.slice(offset, offset + 10)
      const results = await Promise.allSettled(
        batch.map((studentId) =>
          markExamAttendance(
            ctx,
            examAttendanceMarkSchema.parse({
              examId,
              examDate: input.examDate,
              studentId,
              status: input.status,
            }),
          ),
        ),
      )
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') updated += 1
        else failures.push(batch[index]!)
      })
    }

    revalidatePath(`/exams/${examId}/attendance`)
    return {
      ok: failures.length === 0,
      message: failures.length
        ? `${updated} updated; ${failures.length} could not be updated.`
        : `${updated} students marked ${input.status.toLowerCase()}.`,
    }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Attendance could not be updated',
    }
  }
}
