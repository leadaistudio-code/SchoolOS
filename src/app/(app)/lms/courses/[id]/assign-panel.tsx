'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/button'
import { Select } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { assignCourseAction, removeAssignmentAction } from '../../actions'

type ClassOption = { id: string; name: string; sections: { id: string; name: string }[] }

export function AssignPanel({
  courseId,
  published,
  assignments,
  classes,
  canManage,
}: {
  courseId: string
  published: boolean
  assignments: { id: string; label: string; assignedBy: string | null }[]
  classes: ClassOption[]
  canManage: boolean
}) {
  const router = useRouter()
  const { push } = useToast()
  const [pending, startTransition] = React.useTransition()
  const [classId, setClassId] = React.useState('')
  const [sectionId, setSectionId] = React.useState('')
  const sections = classes.find((c) => c.id === classId)?.sections ?? []
  const wholeSchool = assignments.some((a) => a.label === 'Whole school')

  function assign() {
    startTransition(async () => {
      const result = await assignCourseAction(courseId, { classLevelId: classId === 'ALL' ? '' : classId, sectionId })
      push({ tone: result.ok ? 'success' : 'error', title: result.message })
      if (result.ok) {
        setClassId('')
        setSectionId('')
        router.refresh()
      }
    })
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await removeAssignmentAction(id)
      push({ tone: result.ok ? 'success' : 'error', title: result.message })
      if (result.ok) router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      {assignments.length === 0 ? (
        <p className="text-sm text-ink-muted">Not open to any class yet. Students only see courses opened to their class.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {assignments.map((a) => (
            <li
              key={a.id}
              className="inline-flex items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--success)_30%,transparent)] bg-success-bg py-0.5 pl-3 pr-1 text-sm text-success"
              title={a.assignedBy ? `Opened by ${a.assignedBy}` : undefined}
            >
              {a.label}
              {canManage ? (
                <IconButton small label={`Close for ${a.label}`} disabled={pending} onClick={() => remove(a.id)} className="size-6 text-success">
                  <X />
                </IconButton>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canManage && !wholeSchool ? (
        published ? (
          <div className="flex flex-wrap items-center gap-2">
            <Select
              aria-label="Class"
              value={classId}
              onChange={(e) => {
                setClassId(e.target.value)
                setSectionId('')
              }}
              className="w-48"
            >
              <option value="">Choose who can take it…</option>
              <option value="ALL">Whole school</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
            {classId && classId !== 'ALL' && sections.length > 1 ? (
              <Select aria-label="Section" value={sectionId} onChange={(e) => setSectionId(e.target.value)} className="w-40">
                <option value="">All sections</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>Section {s.name}</option>
                ))}
              </Select>
            ) : null}
            <Button size="sm" disabled={!classId} loading={pending} onClick={assign}>
              Open course
            </Button>
          </div>
        ) : (
          <p className="text-sm text-ink-muted">Publish the course to open it to students.</p>
        )
      ) : null}
    </div>
  )
}
