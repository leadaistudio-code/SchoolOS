'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { LMS_CATEGORIES, LMS_LEVELS } from '@/lib/lms/options'
import { fillPath } from './kind-icon'
import type { CourseDetails, LmsResult } from './types'

const GRADES = Array.from({ length: 12 }, (_, i) => i + 1)

/**
 * Course details. Creates a course and opens its builder, or saves an
 * existing one in place.
 */
export function CourseForm({
  course,
  createCourse,
  updateCourse,
  builderPath,
  onSaved,
}: {
  course?: CourseDetails
  createCourse?: (input: unknown) => Promise<LmsResult>
  updateCourse?: (id: string, input: unknown) => Promise<LmsResult>
  /** Route template with `:id`, opened after a course is created. */
  builderPath: string
  onSaved?: () => void
}) {
  const router = useRouter()
  const { push } = useToast()
  const [pending, startTransition] = React.useTransition()
  const [form, setForm] = React.useState({
    title: course?.title ?? '',
    subtitle: course?.subtitle ?? '',
    description: course?.description ?? '',
    category: course?.category ?? 'ROBOTICS',
    level: course?.level ?? 'BEGINNER',
    gradeFrom: course?.gradeFrom ? String(course.gradeFrom) : '',
    gradeTo: course?.gradeTo ? String(course.gradeTo) : '',
    outcomes: course?.outcomes.join('\n') ?? '',
  })
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  function submit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const result = course ? await updateCourse!(course.id, form) : await createCourse!(form)
      push({ tone: result.ok ? 'success' : 'error', title: result.message })
      if (!result.ok) return
      if (!course && result.id) router.push(fillPath(builderPath, { id: result.id }))
      else {
        router.refresh()
        onSaved?.()
      }
    })
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <Field label="Title" required htmlFor="c-title" className="sm:col-span-2">
        <Input id="c-title" value={form.title} onChange={set('title')} placeholder="Build your first line-follower robot" required />
      </Field>
      <Field label="One-line summary" htmlFor="c-sub" className="sm:col-span-2">
        <Input id="c-sub" value={form.subtitle} onChange={set('subtitle')} placeholder="Sensors, motors and a little Arduino code" />
      </Field>
      <Field label="Category" htmlFor="c-cat">
        <Select id="c-cat" value={form.category} onChange={set('category')}>
          {LMS_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </Select>
      </Field>
      <Field label="Level" htmlFor="c-level">
        <Select id="c-level" value={form.level} onChange={set('level')}>
          {LMS_LEVELS.map((l) => (
            <option key={l.value} value={l.value}>{l.label}</option>
          ))}
        </Select>
      </Field>
      <Field label="Suitable from class" htmlFor="c-from" hint="Leave blank for any class">
        <Select id="c-from" value={form.gradeFrom} onChange={set('gradeFrom')}>
          <option value="">Any</option>
          {GRADES.map((g) => <option key={g} value={g}>Class {g}</option>)}
        </Select>
      </Field>
      <Field label="Up to class" htmlFor="c-to">
        <Select id="c-to" value={form.gradeTo} onChange={set('gradeTo')}>
          <option value="">Any</option>
          {GRADES.map((g) => <option key={g} value={g}>Class {g}</option>)}
        </Select>
      </Field>
      <Field label="About this course" htmlFor="c-desc" className="sm:col-span-2">
        <Textarea id="c-desc" rows={4} value={form.description} onChange={set('description')} />
      </Field>
      <Field label="What students will learn" htmlFor="c-out" hint="One per line" className="sm:col-span-2">
        <Textarea id="c-out" rows={4} value={form.outcomes} onChange={set('outcomes')} placeholder={'Wire a motor driver\nRead an IR sensor\nTune a simple controller'} />
      </Field>
      <div className="sm:col-span-2 flex justify-end">
        <Button type="submit" loading={pending}>{course ? 'Save details' : 'Create course'}</Button>
      </div>
    </form>
  )
}
