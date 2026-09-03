'use client'

import { useActionState } from 'react'
import { createSchoolAction } from '../actions'
import { emptyFormState } from '@/lib/form-state'
import { Button } from '@/components/ui/button'
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'
import {
  BOARDS,
  BOARD_LABELS,
  LEAD_SOURCES,
  LEAD_SOURCE_LABELS,
  SCHOOL_TYPES,
  SCHOOL_TYPE_LABELS,
} from '@/lib/growth-crm'

export function NewSchoolForm({
  operators,
}: {
  operators: { id: string; firstName: string; lastName: string }[]
}) {
  const [state, action, pending] = useActionState(createSchoolAction, emptyFormState)

  return (
    <form action={action} className="space-y-4" noValidate>
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="School name" htmlFor="name" required error={state.fieldErrors.name}>
          <Input id="name" name="name" required autoFocus />
        </Field>
        <Field label="City" htmlFor="city" error={state.fieldErrors.city}>
          <Input id="city" name="city" />
        </Field>
        <Field label="State" htmlFor="state">
          <Input id="state" name="state" />
        </Field>
        <Field label="Type" htmlFor="schoolType">
          <Select id="schoolType" name="schoolType" defaultValue="K12">
            {SCHOOL_TYPES.map((type) => (
              <option key={type} value={type}>
                {SCHOOL_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Board" htmlFor="board">
          <Select id="board" name="board" defaultValue="">
            <option value="">Not specified</option>
            {BOARDS.map((board) => (
              <option key={board} value={board}>
                {BOARD_LABELS[board]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Students" htmlFor="studentCount">
          <Input id="studentCount" name="studentCount" inputMode="numeric" />
        </Field>
        <Field label="Phone" htmlFor="phone">
          <Input id="phone" name="phone" inputMode="tel" />
        </Field>
        <Field label="Website" htmlFor="website">
          <Input id="website" name="website" />
        </Field>
        <Field label="Lead source" htmlFor="leadSource">
          <Select id="leadSource" name="leadSource" defaultValue="WEBSITE">
            {LEAD_SOURCES.map((source) => (
              <option key={source} value={source}>
                {LEAD_SOURCE_LABELS[source]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Campaign" htmlFor="campaign">
          <Input id="campaign" name="campaign" placeholder="Delhi NCR School ERP August 2026" />
        </Field>
        <Field label="Owner" htmlFor="ownerId">
          <Select id="ownerId" name="ownerId" defaultValue={operators[0]?.id ?? ''}>
            {operators.map((op) => (
              <option key={op.id} value={op.id}>
                {op.firstName} {op.lastName}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Estimated deal (₹)" htmlFor="dealValue">
          <Input id="dealValue" name="dealValue" inputMode="decimal" />
        </Field>
        <Field label="Estimated ARR (₹)" htmlFor="arr">
          <Input id="arr" name="arr" inputMode="decimal" />
        </Field>
        <Field label="Current ERP" htmlFor="currentErp">
          <Input id="currentErp" name="currentErp" />
        </Field>
        <Field label="Next follow-up" htmlFor="nextFollowUpAt">
          <Input id="nextFollowUpAt" name="nextFollowUpAt" type="datetime-local" />
        </Field>
      </div>

      <Field label="Address" htmlFor="address">
        <Textarea id="address" name="address" rows={2} />
      </Field>
      <Field label="Notes" htmlFor="notes">
        <Textarea id="notes" name="notes" rows={3} />
      </Field>

      <label className="flex items-center gap-2 text-sm text-ink-muted">
        <Checkbox name="confirmDuplicate" />
        Create anyway if a similar school already exists
      </label>

      <Button type="submit" loading={pending}>
        Add school
      </Button>
    </form>
  )
}
