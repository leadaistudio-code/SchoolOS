'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'
import { previewFeeAssignmentAction, publishFeePlanAction } from '../../../actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox, Field, Select } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { formatMoney } from '@/lib/utils'

type Assignment = 'CLASS' | 'SECTION' | 'SELECTED'
type Student = { id: string; name: string; admissionNo: string; section: string }

export function PublishFeePlanForm({
  structure,
  sections,
  currency,
}: {
  structure: { id: string; name: string; className: string; totalMinor: number }
  sections: { id: string; name: string }[]
  currency: string
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = React.useTransition()
  const [assignment, setAssignment] = React.useState<Assignment>('CLASS')
  const [sectionId, setSectionId] = React.useState('')
  const [students, setStudents] = React.useState<Student[]>([])
  const [studentIds, setStudentIds] = React.useState<string[]>([])

  const clearPreview = () => {
    setStudents([])
    setStudentIds([])
  }

  const preview = () => startTransition(async () => {
    const result = await previewFeeAssignmentAction({
      structureId: structure.id,
      assignment: assignment === 'SELECTED' ? 'CLASS' : assignment,
      sectionId: sectionId || undefined,
    })
    if (!result.ok) {
      toast.push({ tone: 'error', title: 'Could not preview students', description: result.message })
      return
    }
    const next = (result.data as { students: Student[] }).students
    setStudents(next)
    setStudentIds(assignment === 'SELECTED' ? [] : next.map((student) => student.id))
  })

  const publish = () => startTransition(async () => {
    const result = await publishFeePlanAction({
      structureId: structure.id,
      assignment,
      sectionId: sectionId || undefined,
      studentIds: assignment === 'SELECTED' ? studentIds : undefined,
    })
    if (!result.ok) {
      toast.push({ tone: 'error', title: 'Fee structure not published', description: result.message })
      return
    }
    toast.push({ tone: 'success', title: 'Fee structure published', description: result.message })
    router.push('/finance/structures')
    router.refresh()
  })

  const selectedCount = assignment === 'SELECTED' ? studentIds.length : students.length

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Choose students</CardTitle>
            <p className="mt-0.5 text-sm text-ink-muted">
              Preview the students before publishing. Invoices are created only for this selection.
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Assign to" htmlFor="publish-assignment">
              <Select
                id="publish-assignment"
                value={assignment}
                onChange={(event) => {
                  setAssignment(event.target.value as Assignment)
                  setSectionId('')
                  clearPreview()
                }}
              >
                <option value="CLASS">Entire class</option>
                <option value="SECTION">Specific section</option>
                <option value="SELECTED">Selected students</option>
              </Select>
            </Field>
            {assignment === 'SECTION' ? (
              <Field label="Section" htmlFor="publish-section" required>
                <Select
                  id="publish-section"
                  value={sectionId}
                  onChange={(event) => {
                    setSectionId(event.target.value)
                    clearPreview()
                  }}
                >
                  <option value="">Choose section</option>
                  {sections.map((section) => (
                    <option key={section.id} value={section.id}>{section.name}</option>
                  ))}
                </Select>
              </Field>
            ) : null}
          </div>

          <Button
            variant="secondary"
            onClick={preview}
            loading={pending}
            disabled={assignment === 'SECTION' && !sectionId}
          >
            Preview affected students
          </Button>

          {students.length ? (
            <div className="overflow-hidden rounded-[var(--radius-sm)] border border-line">
              <div className="flex items-center justify-between gap-3 border-b border-line bg-surface-2 px-3.5 py-2.5">
                <p className="text-sm font-medium text-ink">
                  {selectedCount} of {students.length} students selected
                </p>
                {assignment === 'SELECTED' ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setStudentIds(
                      studentIds.length === students.length ? [] : students.map((student) => student.id),
                    )}
                  >
                    {studentIds.length === students.length ? 'Clear all' : 'Select all'}
                  </Button>
                ) : null}
              </div>
              <ul className="max-h-80 divide-y divide-[var(--border)] overflow-y-auto">
                {students.map((student) => (
                  <li key={student.id} className="flex items-center gap-3 px-3.5 py-2.5">
                    {assignment === 'SELECTED' ? (
                      <Checkbox
                        checked={studentIds.includes(student.id)}
                        onChange={() => setStudentIds((current) =>
                          current.includes(student.id)
                            ? current.filter((id) => id !== student.id)
                            : [...current, student.id],
                        )}
                      />
                    ) : (
                      <Check className="size-4 shrink-0 text-success" aria-hidden />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{student.name}</p>
                      <p className="text-xs text-ink-subtle">
                        {student.admissionNo} · Section {student.section}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <aside className="space-y-3 lg:sticky lg:top-4">
        <div className="rounded-[var(--radius)] border border-line bg-surface p-4">
          <p className="font-semibold text-ink">{structure.name}</p>
          <p className="mt-0.5 text-sm text-ink-muted">{structure.className}</p>
          <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-line pt-3">
            <span className="text-sm text-ink-muted">Annual fee</span>
            <span className="text-lg font-semibold text-ink tnum">
              {formatMoney(structure.totalMinor, currency)}
            </span>
          </div>
        </div>
        <Button
          block
          onClick={publish}
          loading={pending}
          disabled={!students.length || !selectedCount}
        >
          Publish & create invoices
        </Button>
        <p className="text-xs leading-5 text-ink-subtle">
          Publishing locks the fee schedule. Review the selected students before continuing.
        </p>
      </aside>
    </div>
  )
}
