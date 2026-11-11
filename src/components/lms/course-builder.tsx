'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp, Eye, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input } from '@/components/ui/input'
import { StatusBadge } from '@/components/ui/badge'
import { Notice } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'
import { gradeRange, lessonKind, lmsCategory, lmsLevelLabel } from '@/lib/lms/options'
import { CourseForm } from './course-form'
import { KindIcon, fillPath } from './kind-icon'
import type { AuthoringActions, BuilderModule, CourseDetails, LmsResult } from './types'

export type BuilderPaths = {
  /** Builder route, `:id`. */
  builder: string
  /** Lesson editor, `:course` and `:lesson` (`new` with `?module=` adds one). */
  lesson: string
  /** Where to go after the course is deleted. */
  list: string
  /** How a learner sees it, `:id`. */
  preview?: string
}

export function CourseBuilder({
  course,
  modules,
  actions,
  paths,
}: {
  course: CourseDetails
  modules: BuilderModule[]
  actions: AuthoringActions
  paths: BuilderPaths
}) {
  const router = useRouter()
  const { push } = useToast()
  const [pending, startTransition] = React.useTransition()
  const [busy, setBusy] = React.useState<string | null>(null)
  const [editing, setEditing] = React.useState(false)
  const [moduleDialog, setModuleDialog] = React.useState<{ id?: string; title: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = React.useState(false)

  const lessonCount = modules.reduce((s, m) => s + m.lessons.length, 0)
  const minutes = modules.reduce((s, m) => s + m.lessons.reduce((t, l) => t + (l.durationMinutes ?? 0), 0), 0)
  const category = lmsCategory(course.category)
  const grades = gradeRange(course.gradeFrom, course.gradeTo)

  function run(key: string, op: () => Promise<LmsResult>, after?: (r: LmsResult) => void) {
    setBusy(key)
    startTransition(async () => {
      const result = await op()
      setBusy(null)
      if (!result.ok || !['Moved.'].includes(result.message)) {
        push({ tone: result.ok ? 'success' : 'error', title: result.message })
      }
      if (result.ok) {
        after?.(result)
        router.refresh()
      }
    })
  }

  function saveModule() {
    if (!moduleDialog) return
    const { id, title } = moduleDialog
    run('module-save', () => (id ? actions.renameModule(id, title) : actions.addModule(course.id, title)), () => setModuleDialog(null))
  }

  const lessonHref = (lessonId: string, moduleId?: string) =>
    fillPath(paths.lesson, { course: course.id, lesson: lessonId }) + (moduleId ? `?module=${moduleId}` : '')

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <span className="size-2.5 rounded-full" style={{ background: category.colour }} aria-hidden />
            <CardTitle className="truncate">{course.title}</CardTitle>
            <StatusBadge status={course.status} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {paths.preview ? (
              <Link href={fillPath(paths.preview, { id: course.id })} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                <Eye /> Preview
              </Link>
            ) : null}
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              <Pencil /> Details
            </Button>
            {course.status === 'PUBLISHED' ? (
              <Button variant="secondary" size="sm" loading={busy === 'status'} onClick={() => run('status', () => actions.setCourseStatus(course.id, 'DRAFT'))}>
                Unpublish
              </Button>
            ) : (
              <Button size="sm" loading={busy === 'status'} onClick={() => run('status', () => actions.setCourseStatus(course.id, 'PUBLISHED'))}>
                Publish
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-ink-muted">
            {category.label} · {lmsLevelLabel(course.level)}
            {grades ? ` · ${grades}` : ''} · {lessonCount} lesson{lessonCount === 1 ? '' : 's'}
            {minutes ? ` · about ${minutes} min` : ''}
          </p>
          {course.subtitle ? <p className="text-sm text-ink">{course.subtitle}</p> : null}
          {course.status !== 'PUBLISHED' ? (
            <Notice tone="info">
              Draft courses are hidden from students. Publish when the lessons are ready; you can keep editing after that.
            </Notice>
          ) : null}
        </CardContent>
      </Card>

      {modules.map((m, mi) => (
        <Card key={m.id}>
          <CardHeader>
            <CardTitle className="truncate">
              <span className="text-ink-subtle font-normal mr-1.5">Module {mi + 1}</span>
              {m.title}
            </CardTitle>
            <div className="flex items-center gap-0.5">
              <IconButton small label="Move module up" disabled={mi === 0 || pending} onClick={() => run(`mu-${m.id}`, () => actions.moveModule(m.id, 'up'))}>
                <ArrowUp />
              </IconButton>
              <IconButton small label="Move module down" disabled={mi === modules.length - 1 || pending} onClick={() => run(`md-${m.id}`, () => actions.moveModule(m.id, 'down'))}>
                <ArrowDown />
              </IconButton>
              <IconButton small label="Rename module" onClick={() => setModuleDialog({ id: m.id, title: m.title })}>
                <Pencil />
              </IconButton>
              <IconButton
                small
                label="Delete module"
                disabled={modules.length <= 1 || pending}
                onClick={() => {
                  if (window.confirm(`Delete "${m.title}" and its ${m.lessons.length} lesson(s)?`)) run(`mdel-${m.id}`, () => actions.deleteModule(m.id))
                }}
              >
                <Trash2 />
              </IconButton>
            </div>
          </CardHeader>
          <ul className="divide-y divide-[var(--border)]">
            {m.lessons.map((l, li) => (
              <li key={l.id} className="flex items-center gap-3 px-4 py-2">
                <KindIcon kind={l.kind} className="text-ink-subtle" />
                <Link href={lessonHref(l.id)} className="flex-1 min-w-0 truncate text-sm text-ink hover:text-[var(--brand-600)]">
                  {l.title}
                </Link>
                <span className="text-xs text-ink-subtle whitespace-nowrap">
                  {lessonKind(l.kind).label}
                  {l.durationMinutes ? ` · ${l.durationMinutes} min` : ''}
                </span>
                <div className="flex items-center gap-0.5">
                  <IconButton small label="Move lesson up" disabled={li === 0 || pending} onClick={() => run(`lu-${l.id}`, () => actions.moveLesson(l.id, 'up'))}>
                    <ArrowUp />
                  </IconButton>
                  <IconButton small label="Move lesson down" disabled={li === m.lessons.length - 1 || pending} onClick={() => run(`ld-${l.id}`, () => actions.moveLesson(l.id, 'down'))}>
                    <ArrowDown />
                  </IconButton>
                  <IconButton
                    small
                    label="Delete lesson"
                    disabled={pending}
                    onClick={() => {
                      if (window.confirm(`Delete "${l.title}"? Students lose their progress on it.`)) run(`ldel-${l.id}`, () => actions.deleteLesson(l.id))
                    }}
                  >
                    <Trash2 />
                  </IconButton>
                </div>
              </li>
            ))}
            <li className="px-4 py-2">
              <Link href={lessonHref('new', m.id)} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
                <Plus /> Add lesson
              </Link>
            </li>
          </ul>
        </Card>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="secondary" onClick={() => setModuleDialog({ title: '' })}>
          <Plus /> Add module
        </Button>
        <Button variant="ghost" className="text-[var(--danger)]" onClick={() => setConfirmDelete(true)}>
          <Trash2 /> Delete course
        </Button>
      </div>

      <Dialog open={editing} onClose={() => setEditing(false)} title="Course details" size="lg">
        <CourseForm course={course} updateCourse={actions.updateCourse} builderPath={paths.builder} onSaved={() => setEditing(false)} />
      </Dialog>

      <Dialog
        open={!!moduleDialog}
        onClose={() => setModuleDialog(null)}
        title={moduleDialog?.id ? 'Rename module' : 'Add module'}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModuleDialog(null)}>Cancel</Button>
            <Button loading={busy === 'module-save'} onClick={saveModule}>Save</Button>
          </>
        }
      >
        <Field label="Module name" htmlFor="module-title">
          <Input
            id="module-title"
            autoFocus
            value={moduleDialog?.title ?? ''}
            onChange={(e) => setModuleDialog((d) => (d ? { ...d, title: e.target.value } : d))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveModule()
            }}
            placeholder="Sensors and inputs"
          />
        </Field>
      </Dialog>

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this course?"
        description="It disappears from the catalogue and from students' lists. Progress already recorded is kept."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>Keep it</Button>
            <Button
              variant="danger"
              loading={busy === 'delete'}
              onClick={() => run('delete', () => actions.deleteCourse(course.id), () => router.push(paths.list))}
            >
              Delete course
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink">{course.title}</p>
      </Dialog>
    </div>
  )
}
