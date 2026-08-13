'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Select } from '@/components/ui/input'

/**
 * Which exam, and optionally which class.
 *
 * Exam performance has no date range — the exam is the window — so this sits
 * where the range picker sits on the other reports and drives the same URL
 * that the export endpoint reads.
 */
export function ExamPicker({
  exams,
  classes,
  examId,
  classLevelId,
}: {
  exams: { id: string; name: string; session: string; results: number }[]
  classes: { id: string; name: string }[]
  examId: string
  classLevelId: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const push = (mutate: (next: URLSearchParams) => void) => {
    const next = new URLSearchParams(params.toString())
    mutate(next)
    router.push(`${pathname}?${next.toString()}`)
  }

  return (
    <>
      <Select
        value={examId}
        aria-label="Exam"
        className="w-64"
        onChange={(e) =>
          push((next) => {
            next.set('examId', e.target.value)
            next.delete('classLevelId')
          })
        }
      >
        {exams.map((exam) => (
          <option key={exam.id} value={exam.id}>
            {exam.name} — {exam.session} ({exam.results})
          </option>
        ))}
      </Select>

      <Select
        value={classLevelId}
        aria-label="Filter by class"
        className="w-44"
        onChange={(e) =>
          push((next) =>
            e.target.value ? next.set('classLevelId', e.target.value) : next.delete('classLevelId'),
          )
        }
      >
        <option value="">All classes</option>
        {classes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
    </>
  )
}
