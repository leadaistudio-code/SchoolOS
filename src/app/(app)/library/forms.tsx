'use client'

import { useActionState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createBookAction, issueLoanAction, returnLoanAction } from './actions'
import { emptyFormState } from '@/lib/form-state'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'

export function AddBookForm({ categories }: { categories: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(createBookAction, emptyFormState)
  return (
    <form action={action} className="space-y-3">
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.ok ? <Notice tone="success">{state.message}</Notice> : null}
      <Field label="Title" htmlFor="title" required>
        <Input id="title" name="title" required />
      </Field>
      <Field label="Author" htmlFor="author">
        <Input id="author" name="author" />
      </Field>
      <Field label="ISBN" htmlFor="isbn">
        <Input id="isbn" name="isbn" />
      </Field>
      <Field label="Category" htmlFor="categoryId">
        <Select id="categoryId" name="categoryId" defaultValue="">
          <option value="">None</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Copies" htmlFor="totalCopies">
        <Input id="totalCopies" name="totalCopies" type="number" min={1} defaultValue={1} />
      </Field>
      <Button type="submit" loading={pending} block>
        Add book
      </Button>
    </form>
  )
}

export function IssueForm({
  books,
  students,
}: {
  books: { id: string; title: string; availableCopies: number }[]
  students: { id: string; firstName: string; lastName: string; admissionNo: string }[]
}) {
  const [state, action, pending] = useActionState(issueLoanAction, emptyFormState)
  const defaultDue = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10)
  return (
    <form action={action} className="space-y-3">
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.ok ? <Notice tone="success">{state.message}</Notice> : null}
      <Field label="Book" htmlFor="bookId" required>
        <Select id="bookId" name="bookId" required defaultValue="">
          <option value="" disabled>
            Choose book
          </option>
          {books.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title} ({b.availableCopies} left)
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Student" htmlFor="studentId" required>
        <Select id="studentId" name="studentId" required defaultValue="">
          <option value="" disabled>
            Choose student
          </option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.firstName} {s.lastName} · {s.admissionNo}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Due on" htmlFor="dueOn" required>
        <Input id="dueOn" name="dueOn" type="date" required defaultValue={defaultDue} />
      </Field>
      <Button type="submit" loading={pending} block>
        Issue
      </Button>
    </form>
  )
}

export function ReturnButton({ id }: { id: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <Button
      size="sm"
      variant="secondary"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          await returnLoanAction(id)
          router.refresh()
        })
      }
    >
      Return
    </Button>
  )
}
