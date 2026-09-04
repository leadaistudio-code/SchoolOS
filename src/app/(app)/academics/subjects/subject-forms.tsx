'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Link2, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Checkbox, Field, Input, Select } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { SUBJECT_PRESETS } from '@/lib/subject-presets'
import {
  archiveSubjectAction,
  assignSubjectsToClassesAction,
  createSubjectAction,
  unassignSubjectAction,
  updateClassSubjectAction,
  updateSubjectAction,
} from './actions'

export type Option = { id: string; label: string }

export type AssignmentPair = { subjectId: string; classLevelId: string }

function ClassCheckboxGrid({
  classes,
  selectedIds,
  onToggle,
  disabledIds,
}: {
  classes: Option[]
  selectedIds: string[]
  onToggle: (id: string, checked: boolean) => void
  disabledIds?: Set<string>
}) {
  if (classes.length === 0) {
    return (
      <p className="text-sm text-warning">
        No classes found for the current academic session. Create a class under Academics → Classes
        first.
      </p>
    )
  }

  return (
    <div className="grid max-h-48 gap-1.5 overflow-y-auto rounded-[var(--radius-sm)] border border-line p-2 sm:grid-cols-2">
      {classes.map((c) => {
        const disabled = disabledIds?.has(c.id)
        return (
          <label
            key={c.id}
            className={`flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-sm ${
              disabled
                ? 'cursor-not-allowed text-ink-subtle'
                : 'cursor-pointer text-ink hover:bg-surface-2'
            }`}
          >
            <Checkbox
              checked={selectedIds.includes(c.id)}
              disabled={disabled}
              onChange={(e) => onToggle(c.id, e.target.checked)}
            />
            <span>{c.label}</span>
            {disabled ? <span className="text-xs text-ink-subtle">mapped</span> : null}
          </label>
        )
      })}
    </div>
  )
}

function TeacherSelect({
  id,
  teachers,
  value,
  onChange,
}: {
  id: string
  teachers: Option[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <Field
      label="Teacher"
      htmlFor={id}
      hint={
        teachers.length === 0
          ? 'No teaching staff on record yet'
          : 'Optional default teacher for the selected classes'
      }
    >
      <Select id={id} value={value} disabled={teachers.length === 0} onChange={(e) => onChange(e.target.value)}>
        <option value="">Not assigned yet</option>
        {teachers.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </Select>
    </Field>
  )
}

export function NewSubjectButton({
  label = 'New subject',
  classes = [],
  teachers = [],
}: {
  label?: string
  classes?: Option[]
  teachers?: Option[]
}) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const [preset, setPreset] = React.useState('')
  const [code, setCode] = React.useState('')
  const [name, setName] = React.useState('')
  const [isElective, setIsElective] = React.useState(false)
  const [classLevelIds, setClassLevelIds] = React.useState<string[]>([])
  const [teacherId, setTeacherId] = React.useState('')

  const openDialog = () => {
    setPreset('')
    setCode('')
    setName('')
    setIsElective(false)
    setClassLevelIds([])
    setTeacherId('')
    setOpen(true)
  }

  const toggleClass = (id: string, checked: boolean) => {
    setClassLevelIds((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)))
  }

  const submit = () =>
    startTransition(async () => {
      const result = await createSubjectAction({
        code: code.trim().toUpperCase(),
        name: name.trim(),
        isElective,
        classLevelIds,
        teacherId: teacherId || undefined,
      })
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Could not create subject', description: result.message })
        return
      }
      toast.push({ tone: 'success', title: 'Subject created', description: result.message })
      setOpen(false)
      setPreset('')
      setCode('')
      setName('')
      setIsElective(false)
      setClassLevelIds([])
      setTeacherId('')
      router.refresh()
    })

  const applyPreset = (value: string) => {
    setPreset(value)
    if (!value) return
    const match = SUBJECT_PRESETS.find((p) => p.code === value)
    if (!match) return
    setCode(match.code)
    setName(match.name)
    setIsElective(match.isElective)
  }

  return (
    <>
      <Button size="sm" onClick={openDialog}>
        <Plus aria-hidden /> {label}
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="New subject"
        description="A subject exists once for the whole school. Attach it to each class that studies it."
        footer={
          <>
            <Button onClick={submit} loading={pending} disabled={!code.trim() || !name.trim()}>
              Create subject
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
          <Field
            label="Common subject"
            htmlFor="subject-preset"
            className="sm:col-span-2"
            hint="Pick a template or type your own code and name below"
          >
            <Select
              id="subject-preset"
              value={preset}
              onChange={(e) => applyPreset(e.target.value)}
            >
              <option value="">Choose a common subject...</option>
              {SUBJECT_PRESETS.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name} ({p.code})
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Code" htmlFor="subject-code" required hint="Letters and numbers">
            <Input
              id="subject-code"
              value={code}
              onChange={(e) => {
                setPreset('')
                setCode(e.target.value.toUpperCase())
              }}
              placeholder="MATH"
            />
          </Field>

          <Field label="Subject name" htmlFor="subject-name" required>
            <Input
              id="subject-name"
              value={name}
              onChange={(e) => {
                setPreset('')
                setName(e.target.value)
              }}
              placeholder="Mathematics"
            />
          </Field>

          <label className="flex items-center gap-2 sm:col-span-2">
            <Checkbox
              checked={isElective}
              onChange={(e) => {
                setPreset('')
                setIsElective(e.target.checked)
              }}
            />
            <span className="text-sm text-ink">
              Elective — students choose it rather than all taking it
            </span>
          </label>

          <Field
            label="Map to classes"
            className="sm:col-span-2"
            hint="Select every class that studies this subject. You can add more later."
          >
            <ClassCheckboxGrid
              classes={classes}
              selectedIds={classLevelIds}
              onToggle={toggleClass}
            />
          </Field>

          <div className="sm:col-span-2">
            <TeacherSelect
              id="new-subject-teacher"
              teachers={teachers}
              value={teacherId}
              onChange={setTeacherId}
            />
          </div>
        </div>
      </Dialog>
    </>
  )
}

export function EditSubjectButton({
  id,
  code: initialCode,
  name: initialName,
  isElective: initialElective,
  classCount,
}: {
  id: string
  code: string
  name: string
  isElective: boolean
  classCount: number
}) {
  const toast = useToast()
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const [code, setCode] = React.useState(initialCode)
  const [name, setName] = React.useState(initialName)
  const [isElective, setIsElective] = React.useState(initialElective)
  const [confirmRemove, setConfirmRemove] = React.useState(false)

  const openDialog = () => {
    setCode(initialCode)
    setName(initialName)
    setIsElective(initialElective)
    setConfirmRemove(false)
    setOpen(true)
  }

  const submit = () =>
    startTransition(async () => {
      const result = await updateSubjectAction({
        id,
        code: code.trim().toUpperCase(),
        name: name.trim(),
        isElective,
      })
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Could not update subject', description: result.message })
        return
      }
      toast.push({ tone: 'success', title: 'Subject updated', description: result.message })
      setOpen(false)
    })

  const remove = () =>
    startTransition(async () => {
      const result = await archiveSubjectAction(id)
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Could not archive subject', description: result.message })
        return
      }
      toast.push({ tone: 'success', title: 'Subject archived', description: result.message })
      setOpen(false)
    })

  return (
    <>
      <IconButton label={`Edit ${initialName}`} onClick={openDialog}>
        <Pencil className="size-3.5" aria-hidden />
      </IconButton>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Edit ${initialName}`}
        description="Changes apply everywhere this subject is taught."
        footer={
          <>
            <Button onClick={submit} loading={pending} disabled={!code.trim() || !name.trim()}>
              Save changes
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
          <Field label="Code" htmlFor={`edit-code-${id}`} required>
            <Input
              id={`edit-code-${id}`}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              autoFocus
            />
          </Field>
          <Field label="Subject name" htmlFor={`edit-name-${id}`} required>
            <Input
              id={`edit-name-${id}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <label className="flex items-center gap-2 sm:col-span-2">
            <Checkbox checked={isElective} onChange={(e) => setIsElective(e.target.checked)} />
            <span className="text-sm text-ink">Elective</span>
          </label>
        </div>

        <div className="mt-4 border-t border-line pt-3">
          {confirmRemove ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-ink-muted">
                {classCount > 0
                  ? `Still taught in ${classCount} class${classCount === 1 ? '' : 'es'} — unassign first.`
                  : 'Archive this subject? It will leave the catalogue.'}
              </p>
              <Button
                size="sm"
                variant="danger"
                loading={pending}
                disabled={classCount > 0}
                onClick={remove}
              >
                Archive
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(false)}>
                Keep
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(true)}>
              <Trash2 aria-hidden /> Archive subject
            </Button>
          )}
        </div>
      </Dialog>
    </>
  )
}

export function AssignSubjectButton({
  classes,
  subjects,
  teachers,
  assignedPairs = [],
  variant = 'secondary',
  label = 'Map subject to classes',
}: {
  classes: Option[]
  subjects: Option[]
  teachers: Option[]
  assignedPairs?: AssignmentPair[]
  variant?: 'primary' | 'secondary'
  label?: string
}) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const [subjectId, setSubjectId] = React.useState('')
  const [classLevelIds, setClassLevelIds] = React.useState<string[]>([])
  const [teacherId, setTeacherId] = React.useState('')

  const blocked = classes.length === 0 || subjects.length === 0

  const disabledClassIds = React.useMemo(() => {
    if (!subjectId) return new Set<string>()
    return new Set(
      assignedPairs
        .filter((p) => p.subjectId === subjectId)
        .map((p) => p.classLevelId),
    )
  }, [assignedPairs, subjectId])

  const openDialog = () => {
    setSubjectId('')
    setClassLevelIds([])
    setTeacherId('')
    setOpen(true)
  }

  const toggleClass = (id: string, checked: boolean) => {
    setClassLevelIds((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)))
  }

  const submit = () =>
    startTransition(async () => {
      const result = await assignSubjectsToClassesAction({
        subjectId,
        classLevelIds,
        teacherId: teacherId || undefined,
      })
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Could not map subject', description: result.message })
        return
      }
      toast.push({ tone: 'success', title: 'Subject mapped', description: result.message })
      setOpen(false)
      setSubjectId('')
      setClassLevelIds([])
      setTeacherId('')
      router.refresh()
    })

  return (
    <>
      <Button
        size="sm"
        variant={variant}
        onClick={openDialog}
        disabled={blocked}
        title={
          blocked
            ? classes.length === 0
              ? 'Create a class under Academics > Classes first'
              : 'Create at least one subject first'
            : 'Map a subject to one or more classes'
        }
      >
        <Link2 aria-hidden /> {label}
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Map subject to classes"
        description="Choose a subject and the classes that study it. Syllabus, timetable and homework attach to each pairing."
        footer={
          <>
            <Button
              onClick={submit}
              loading={pending}
              disabled={!subjectId || classLevelIds.length === 0}
            >
              Save mapping
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </>
        }
      >
        {subjects.length === 0 ? (
          <p className="text-sm text-warning mb-3">
            No subjects in the catalogue yet. Add a subject first, then map it here.
          </p>
        ) : null}
        <div className="grid gap-3">
          <Field label="Subject" htmlFor="assign-subject" required>
            <Select
              id="assign-subject"
              value={subjectId}
              onChange={(e) => {
                setSubjectId(e.target.value)
                setClassLevelIds([])
              }}
            >
              <option value="">Choose a subject</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Classes"
            hint={
              subjectId
                ? 'Already mapped classes are disabled'
                : 'Pick a subject first, then select classes'
            }
          >
            <ClassCheckboxGrid
              classes={classes}
              selectedIds={classLevelIds}
              onToggle={toggleClass}
              disabledIds={disabledClassIds}
            />
          </Field>

          <TeacherSelect
            id="assign-teacher"
            teachers={teachers}
            value={teacherId}
            onChange={setTeacherId}
          />
        </div>
      </Dialog>
    </>
  )
}

export function MapSubjectToClassesButton({
  subjectId,
  subjectLabel,
  classes,
  teachers,
  assignedPairs,
  mappedClassNames,
}: {
  subjectId: string
  subjectLabel: string
  classes: Option[]
  teachers: Option[]
  assignedPairs: AssignmentPair[]
  mappedClassNames: string[]
}) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const [classLevelIds, setClassLevelIds] = React.useState<string[]>([])
  const [teacherId, setTeacherId] = React.useState('')

  const disabledClassIds = React.useMemo(
    () =>
      new Set(
        assignedPairs
          .filter((p) => p.subjectId === subjectId)
          .map((p) => p.classLevelId),
      ),
    [assignedPairs, subjectId],
  )

  const toggleClass = (id: string, checked: boolean) => {
    setClassLevelIds((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)))
  }

  const submit = () =>
    startTransition(async () => {
      const result = await assignSubjectsToClassesAction({
        subjectId,
        classLevelIds,
        teacherId: teacherId || undefined,
      })
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Could not map classes', description: result.message })
        return
      }
      toast.push({ tone: 'success', title: 'Classes mapped', description: result.message })
      setOpen(false)
      setClassLevelIds([])
      setTeacherId('')
      router.refresh()
    })

  return (
    <>
      <IconButton label={`Map ${subjectLabel} to classes`} onClick={() => setOpen(true)}>
        <Link2 className="size-3.5" aria-hidden />
      </IconButton>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Map ${subjectLabel} to classes`}
        description="Add this subject to more classes. Each class pairing can have its own syllabus and timetable."
        footer={
          <>
            <Button onClick={submit} loading={pending} disabled={classLevelIds.length === 0}>
              Add to selected classes
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </>
        }
      >
        {mappedClassNames.length > 0 ? (
          <p className="mb-3 text-sm text-ink-muted">
            Already mapped: {mappedClassNames.join(', ')}
          </p>
        ) : (
          <p className="mb-3 text-sm text-ink-muted">Not mapped to any class yet.</p>
        )}

        <div className="grid gap-3">
          <Field label="Add to classes">
            <ClassCheckboxGrid
              classes={classes}
              selectedIds={classLevelIds}
              onToggle={toggleClass}
              disabledIds={disabledClassIds}
            />
          </Field>
          <TeacherSelect
            id={`map-teacher-${subjectId}`}
            teachers={teachers}
            value={teacherId}
            onChange={setTeacherId}
          />
        </div>
      </Dialog>
    </>
  )
}

export function EditAssignmentButton({
  id,
  classLabel,
  subjectLabel,
  teacherId: initialTeacherId,
  teachers,
  sections,
  selectedSectionIds: initialSectionIds,
  hasSyllabusOrTimetable,
}: {
  id: string
  classLabel: string
  subjectLabel: string
  teacherId: string | null
  teachers: Option[]
  /** Sections of this class — used to restrict who takes the subject. */
  sections: Option[]
  /**
   * Empty means "all sections" (no SectionSubject rows). When non-empty, only
   * those section ids are mapped.
   */
  selectedSectionIds: string[]
  hasSyllabusOrTimetable: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const [teacherId, setTeacherId] = React.useState(initialTeacherId ?? '')
  const [sectionIds, setSectionIds] = React.useState<string[]>([])
  const [confirmRemove, setConfirmRemove] = React.useState(false)

  const openDialog = () => {
    setTeacherId(initialTeacherId ?? '')
    // No restriction stored ⇒ show every section checked.
    setSectionIds(
      initialSectionIds.length > 0 ? [...initialSectionIds] : sections.map((s) => s.id),
    )
    setConfirmRemove(false)
    setOpen(true)
  }

  const toggleSection = (sectionId: string, checked: boolean) => {
    setSectionIds((prev) =>
      checked ? [...prev, sectionId] : prev.filter((x) => x !== sectionId),
    )
  }

  const submit = () =>
    startTransition(async () => {
      const result = await updateClassSubjectAction({
        id,
        teacherId: teacherId || null,
        sectionIds,
      })
      if (!result.ok) {
        toast.push({
          tone: 'error',
          title: 'Could not update assignment',
          description: result.message,
        })
        return
      }
      toast.push({ tone: 'success', title: 'Assignment updated', description: result.message })
      setOpen(false)
      router.refresh()
    })

  const remove = () =>
    startTransition(async () => {
      const result = await unassignSubjectAction(id)
      if (!result.ok) {
        toast.push({
          tone: 'error',
          title: 'Could not remove assignment',
          description: result.message,
        })
        return
      }
      toast.push({ tone: 'success', title: 'Assignment removed', description: result.message })
      setOpen(false)
      router.refresh()
    })

  return (
    <>
      <IconButton label={`Edit ${subjectLabel} in ${classLabel}`} onClick={openDialog}>
        <Pencil className="size-3.5" aria-hidden />
      </IconButton>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`${subjectLabel} · ${classLabel}`}
        description="Who teaches this subject, and which sections take it. Admit cards only list papers mapped to the student’s section."
        footer={
          <>
            <Button
              onClick={submit}
              loading={pending}
              disabled={sections.length > 0 && sectionIds.length === 0}
            >
              Save
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </>
        }
      >
        <div className="grid gap-3">
          <Field label="Teacher" htmlFor={`edit-teacher-${id}`}>
            <Select
              id={`edit-teacher-${id}`}
              value={teacherId}
              onChange={(e) => setTeacherId(e.target.value)}
            >
              <option value="">Not assigned yet</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Sections"
            hint={
              sections.length === 0
                ? 'This class has no sections yet'
                : 'Uncheck sections that do not take this subject (electives / stream splits). Leave all checked for every section.'
            }
          >
            {sections.length === 0 ? (
              <p className="text-sm text-ink-subtle">Add sections under Academics → Classes first.</p>
            ) : (
              <div className="grid max-h-48 gap-1.5 overflow-y-auto rounded-[var(--radius-sm)] border border-line p-2 sm:grid-cols-2">
                {sections.map((s) => (
                  <label
                    key={s.id}
                    className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-sm text-ink hover:bg-surface-2"
                  >
                    <Checkbox
                      checked={sectionIds.includes(s.id)}
                      onChange={(e) => toggleSection(s.id, e.target.checked)}
                    />
                    <span>{s.label}</span>
                  </label>
                ))}
              </div>
            )}
          </Field>
        </div>

        <div className="mt-4 border-t border-line pt-3">
          {confirmRemove ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-ink-muted">
                {hasSyllabusOrTimetable
                  ? 'Still has a syllabus or timetable slots — remove those first.'
                  : 'Remove this subject from the class?'}
              </p>
              <Button
                size="sm"
                variant="danger"
                loading={pending}
                disabled={hasSyllabusOrTimetable}
                onClick={remove}
              >
                Remove
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(false)}>
                Keep
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(true)}>
              <Trash2 aria-hidden /> Remove from class
            </Button>
          )}
        </div>
      </Dialog>
    </>
  )
}
