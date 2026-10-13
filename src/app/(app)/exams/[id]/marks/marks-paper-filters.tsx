'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Field, Select } from '@/components/ui/input'

export type MarksPaperOption = {
  id: string
  classLevelId: string
  className: string
  subjectId: string
  subjectName: string
}

/**
 * Class first, then subject — picks the exam paper (`?subject=` = examSubject id).
 */
export function MarksPaperFilters({
  examId,
  papers,
  selectedId,
}: {
  examId: string
  papers: MarksPaperOption[]
  selectedId: string
}) {
  const router = useRouter()
  const selected = papers.find((paper) => paper.id === selectedId) ?? papers[0]

  const classes = React.useMemo(() => {
    const seen = new Map<string, { id: string; name: string }>()
    for (const paper of papers) {
      if (!seen.has(paper.classLevelId)) {
        seen.set(paper.classLevelId, { id: paper.classLevelId, name: paper.className })
      }
    }
    return [...seen.values()]
  }, [papers])

  const [classLevelId, setClassLevelId] = React.useState(
    selected?.classLevelId ?? classes[0]?.id ?? '',
  )

  React.useEffect(() => {
    if (selected?.classLevelId) setClassLevelId(selected.classLevelId)
  }, [selected?.classLevelId])

  const subjectsForClass = papers.filter((paper) => paper.classLevelId === classLevelId)

  const goToPaper = (examSubjectId: string) => {
    router.push(`/exams/${examId}/marks?subject=${examSubjectId}`)
  }

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Class" htmlFor="marks-class" required>
            <Select
              id="marks-class"
              value={classLevelId}
              onChange={(event) => {
                const nextClass = event.target.value
                setClassLevelId(nextClass)
                const firstPaper = papers.find((paper) => paper.classLevelId === nextClass)
                if (firstPaper) goToPaper(firstPaper.id)
              }}
            >
              {classes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Subject" htmlFor="marks-subject" required>
            <Select
              id="marks-subject"
              value={selected?.id ?? ''}
              onChange={(event) => goToPaper(event.target.value)}
            >
              {subjectsForClass.map((paper) => (
                <option key={paper.id} value={paper.id}>
                  {paper.subjectName}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </CardContent>
    </Card>
  )
}
